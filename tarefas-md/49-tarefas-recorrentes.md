# Doc 49 — Tarefas recorrentes (repete a cada X, todo dia X, etc)

## Motivação

Ummense suporta tarefas recorrentes (campo `repeat` no shape de task que
vimos no extractor). KTask hoje não tem isso. Use cases reais:

- Reunião semanal de equipe (toda segunda 09:00)
- Backup mensal (todo dia 1)
- Renovação de contrato (a cada 12 meses)
- Lembrete a cada N dias

## Escopo

Aplica-se a:

- **Items de checklist** (caso principal, igual Ummense)
- **Standalone tasks** (futuro — fora deste doc)
- **Cards inteiros** (fora — quem precisa cria uma automation `CREATE_CHILD_CARD` agendada)

## Modelo de recorrência

```prisma
model ChecklistItem {
  // existente
  repeat Json?  // { type, interval, byWeekday?, byMonthDay?, endDate? }
}
```

Tipos suportados (espelhando RRULE simplificado):

```ts
type Repeat =
  | { type: 'DAILY'; interval: number; endDate?: string } // a cada N dias
  | { type: 'WEEKLY'; interval: number; byWeekday: Weekday[]; endDate?: string }
  | { type: 'MONTHLY'; interval: number; byMonthDay: number; endDate?: string }
  | { type: 'YEARLY'; interval: number; endDate?: string };
type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
```

Exemplos:

- `{ type: 'DAILY', interval: 1 }` — todo dia
- `{ type: 'WEEKLY', interval: 1, byWeekday: ['MON','WED','FRI'] }` — seg/qua/sex
- `{ type: 'MONTHLY', interval: 1, byMonthDay: 5 }` — todo dia 5 do mês
- `{ type: 'WEEKLY', interval: 2, byWeekday: ['MON'] }` — segunda sim segunda não

## Comportamento

Quando um item recorrente é marcado como **done**:

1. Salva o evento de conclusão normalmente (Activity, doneAt, doneById)
2. Calcula `nextDueDate` baseado em `repeat` + `item.dueDate` atual
3. Cria um **novo ChecklistItem** clone do original:
   - mesmo texto, assignee, priority
   - `dueDate = nextDueDate`
   - `repeat = mesmo objeto`
   - `isDone = false`
   - position = depois do original (ou nova posição)
4. O item original fica **concluído e visível** no histórico
5. Se `repeat.endDate` está no passado pós-calculo → não cria próximo

Vantagens dessa abordagem:

- Cada ocorrência tem identidade própria → automations escopadas (doc 48)
  funcionam corretamente (cada item tem seu próprio `scopeChecklistItemId`)
- Histórico fica preservado (vê quantas vezes foi feito)
- Engine de notificações funciona sem mudança (cada item tem dueDate próprio)

Trade-off: muitas ocorrências geram muitos rows. Não é problema em escala
normal (1 task/dia × 1 ano = 365 rows).

## Etapas

### 1. Schema (~15min)

- Adicionar `ChecklistItem.repeat Json?`
- Migration `ALTER TABLE "ChecklistItem" ADD COLUMN "repeat" JSONB`

### 2. Service (~1h)

- `updateItem`: ao detectar transição `isDone false→true` em item com
  `repeat`, calcular `nextDueDate` e criar próximo item.
- Helper `calculateNextDueDate(currentDueDate, repeat)`:
  - DAILY: addDays(currentDueDate, interval)
  - WEEKLY: próximo dia em `byWeekday` após currentDueDate, respeitando interval
  - MONTHLY: addMonths(currentDueDate, interval), forçando `byMonthDay`
  - YEARLY: addYears(currentDueDate, interval)
- Validação: `repeat.endDate` no passado → não cria

### 3. API (~30min)

- `POST /checklists/:id/items` e `PATCH /checklists/items/:id` aceitam
  campo `repeat: Repeat | null` opcional.
- Zod schema RepeatSchema validando os 4 tipos via discriminated union.

### 4. UI (~3h)

No item de checklist (popover ao lado do prazo):

- Ícone 🔄 ou texto pequeno "Repete diariamente"
- Click abre popover com:
  - Toggle "Repetir"
  - Dropdown type (Diariamente / Semanalmente / Mensalmente / Anualmente)
  - Input interval
  - Multi-select dias (se WEEKLY)
  - Input dia do mês (se MONTHLY)
  - Date picker "Termina em" (opcional)
- Salva via PATCH `/checklists/items/:id`

Visual minimalista — não poluir item com texto longo.

### 5. Migração de tarefas Ummense recorrentes (~1h)

O extractor capturou `repeat` (campo `tasks[].repeat`). Adaptar
`import-ummense-tasks-to-ktask.mjs` pra:

- Mapear Ummense repeat → KTask Repeat schema
- Passar no `POST /items` quando criar

Shape Ummense esperado (precisa confirmar com sample real):

```json
{
  "interval": 1,
  "period": "weeks",
  "weekdays": ["monday", "wednesday", "friday"],
  "endsAt": null
}
```

### 6. Activity log (~15min)

Tipo novo `CHECKLIST_ITEM_RECURRED`: registrado quando um item gera
sua próxima ocorrência via repeat. Payload: `{ parentItemId, newItemId, dueDate }`.

### 7. Tests (~30min)

- Spec do `calculateNextDueDate` cobrindo:
  - DAILY com interval=3
  - WEEKLY com byWeekday=['MON','FRI']
  - MONTHLY com byMonthDay=31 em Fev (fallback pra 28/29)
  - endDate no passado → null
- Spec do `updateItem`: marcar item recorrente como done cria próximo

## Critérios de aceite

- [ ] Posso configurar item: "repete a cada 7 dias"
- [ ] Posso configurar: "toda segunda e quarta"
- [ ] Posso configurar: "todo dia 5 do mês"
- [ ] Marcar item recorrente como done cria próximo automaticamente
- [ ] Item antigo fica visível como done no histórico
- [ ] Cancelar recorrência (`repeat = null`) para a regeneração
- [ ] `endDate` no passado encerra a série
- [ ] Edge case: dia 31 em Fev → recua pra último dia do mês
- [ ] Activity log registra CHECKLIST_ITEM_RECURRED
- [ ] Importer Ummense traduz `repeat` corretamente
- [ ] Typecheck + lint + tests verdes

## Riscos / decisões

- **Fuso horário**: dueDate é UTC no banco; "todo dia 5" precisa
  respeitar BRT (-3). Helper `calculateNextDueDate` recebe timezone.
- **Item recorrente sem dueDate**: usar `createdAt` ou data atual como
  âncora? Decisão: usar `new Date()` no momento da conclusão.
- **Multi-recorrência manual**: usuário pode marcar done VÁRIAS vezes
  num dia? Cada done dispara nova ocorrência? Decisão V1: sim, cria
  cada vez (poucos casos reais; usuário responsável).
- **Cascata com automation doc 48**: marcar item recorrente como done
  dispara `CHECKLIST_ITEM_DONE` na automation? **SIM** — comportamento
  consistente. Se quiser pular, condicionar via conditions.
- **Standalone task recorrente**: fora deste doc (pode entrar como
  doc 50 se virar demanda).

## Esforço total estimado

~7 horas (schema + service + API + UI + migração + tests).

## Prioridade vs outros pendentes

Comparando com docs 47 (auto. faltantes) e 48 (auto. por tarefa, JÁ FEITO):

| Doc                    | Status   | Esforço | Valor                                       |
| ---------------------- | -------- | ------- | ------------------------------------------- |
| 47.1 Alert flags       | Pendente | 1d      | médio                                       |
| 47.3 Send Email        | Pendente | 2d      | médio (cliente real)                        |
| 47.5b REQUEST_APPROVAL | Pendente | 1d      | alto                                        |
| **49 Recorrência**     | **Aqui** | **~1d** | **alto** — Ummense tinha, várias users usam |

Sugestão: priorizar 49 (recorrência) junto com REQUEST_APPROVAL na
próxima leva. Ambos ~1d cada.
