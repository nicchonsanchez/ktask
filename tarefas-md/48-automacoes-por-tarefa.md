# Doc 48 — Automações por tarefa/checklist

## Escopo

Adicionar dois níveis novos de automação no KTask:

1. **Por item de checklist** (granular): "quando ESTA tarefa for concluída → fazer X"
2. **Por checklist** (agregado): "quando ESTE checklist for 100% concluído → fazer X"

Ambos com botão 🤖 visível na UI no escopo correspondente.

**Fora do escopo:** "quando QUALQUER tarefa de QUALQUER checklist do card for concluída" — pode entrar como Fase 2 se houver demanda.

## Etapas

### 1. Schema Prisma (~30min)

Adicionar 2 triggers ao enum `AutomationTrigger`:

```prisma
enum AutomationTrigger {
  // existentes...
  CHECKLIST_ITEM_DONE       // dispara quando item específico marcado como done
  CHECKLIST_COMPLETED       // dispara quando checklist específico atinge 100%
}
```

Adicionar campos de escopo opcionais ao `Automation`:

```prisma
model Automation {
  // existentes...
  scopeChecklistItemId  String?         // se trigger=CHECKLIST_ITEM_DONE
  scopeChecklistId      String?         // se trigger=CHECKLIST_COMPLETED
  scopeChecklistItem    ChecklistItem?  @relation(...)
  scopeChecklist        Checklist?      @relation(...)
}
```

`listId` continua opcional pra esses casos (porque o item/checklist é "móvel" — o card pode ser movido entre listas mas a automação fica colada no item/checklist).

Migration: ALTER TABLE adicionando 2 colunas FK + 2 enum values.

### 2. Zod schema (5min)

`AutomationTriggerSchema`: adicionar `'CHECKLIST_ITEM_DONE'` e `'CHECKLIST_COMPLETED'`.
`CreateAutomationSchema`: aceitar `scopeChecklistItemId` e `scopeChecklistId` opcionais (apenas um por automação).
Validação cruzada: trigger=ITEM_DONE → exige scopeChecklistItemId; trigger=COMPLETED → exige scopeChecklistId.

### 3. Engine: emit + listen (~1h)

**`ChecklistsService.updateItem`** ([checklists.service.ts](apps/api/src/modules/checklists/checklists.service.ts)):

Após marcar `isDone: true`:

- Emit `checklist.item.done` com `{ itemId, checklistId, cardId, listId, organizationId }`
- Conta items restantes do checklist (where isDone=false). Se 0 → emit `checklist.completed`.

**`automations.engine.ts`**:

```ts
@OnEvent('checklist.item.done')
async onChecklistItemDone(payload) {
  const automations = await this.prisma.automation.findMany({
    where: {
      organizationId: payload.organizationId,
      isActive: true,
      trigger: 'CHECKLIST_ITEM_DONE',
      scopeChecklistItemId: payload.itemId,
    },
  });
  // executa cada uma chamando this.runAction(...)
}

@OnEvent('checklist.completed')
async onChecklistCompleted(payload) {
  // similar, mas scopeChecklistId
}
```

### 4. API: endpoints novos pra listar/criar por escopo

Padrão paralelo ao `/lists/:listId/automations`:

- `GET /checklists/:checklistId/automations` — lista
- `POST /checklists/:checklistId/automations` — cria (trigger=CHECKLIST_COMPLETED)
- `GET /checklists/items/:itemId/automations` — lista
- `POST /checklists/items/:itemId/automations` — cria (trigger=CHECKLIST_ITEM_DONE)

Permissão: precisa ser editor do card (BoardAccess + privacy).

### 5. UI — botão 🤖 nos 2 níveis (~3h)

**5a. Por checklist** (cabeçalho):

```
Tarefas (3/5)  🤖  + adicionar
─────────────────────────────
☑ Briefing aprovado     🚩 hoje
...
```

- Botão 🤖 ao lado do título do checklist
- Badge com contador de automações ativas se houver (ex: 🤖²)
- Click abre dialog reusando `CreateAutomationForm` mas com trigger pré-fixado em `CHECKLIST_COMPLETED` e dropdown só com triggers compatíveis

**5b. Por item** (linha):

```
☐ Layout finalizado     🚩 🤖 amanhã 👤
```

- Botão 🤖 entre a bandeira de prioridade e a data
- Badge com contador pequeno se ativa
- Click abre o mesmo dialog mas com trigger pré-fixado em `CHECKLIST_ITEM_DONE`
- Visual minimalista: 12px, opacity 60% quando sem automation, 100% quando tem

### 6. CreateAutomationForm: aceitar escopo (~1h)

Adicionar prop opcional `scope: { kind: 'list' | 'checklist' | 'item', id: string }`.

- Quando `kind=checklist`: trigger lock em `CHECKLIST_COMPLETED`, ocultar opções list-bound
- Quando `kind=item`: trigger lock em `CHECKLIST_ITEM_DONE`
- Actions disponíveis: mesmas que list-scoped (MOVE_CARD, INSERT_TAGS, etc.)

### 7. Tests + spec (~30min)

- `automations.engine.spec.ts`: 2 testes novos (CHECKLIST_ITEM_DONE dispara, CHECKLIST_COMPLETED dispara)
- Spec de E2E: criar automation por item, marcar como done, verificar action executou

## Critérios de aceite

- [ ] Posso criar automação "quando tarefa X concluída → mover card pra coluna Y"
- [ ] Posso criar automação "quando checklist 'Briefing' 100% concluído → INSERT_TAGS 'Pronto pra design'"
- [ ] Botão 🤖 visível no item E no cabeçalho do checklist
- [ ] Badge mostra quantas automações cada nível tem
- [ ] Marcar item como done dispara só as automações daquele item específico (não todas do card)
- [ ] Quando último item do checklist for marcado, dispara também `CHECKLIST_COMPLETED`
- [ ] Re-marcar como undone NÃO dispara nada (event só em transição false→true)
- [ ] Activity log registra execução
- [ ] Typecheck + lint + tests verdes

## Riscos / decisões

- **Cascata**: marcar último item dispara DOIS eventos (ITEM_DONE + COMPLETED). Ambos podem ter automações. Ordem: ITEM_DONE primeiro, depois COMPLETED. Aceita.
- **Move item para outro checklist**: se automação está colada no item, segue o item. Se a UI permite mover item entre checklists, a scope permanece válido (item ID não muda).
- **Delete do item/checklist**: cascade na FK precisa apagar automation. Considerar: ON DELETE CASCADE no Prisma.
- **Performance**: 2 queries extras no `updateItem` (count + emit). Aceitável (a maior parte do tempo é da query principal).
- **UX poluição**: botão 🤖 em CADA item pode poluir muito a UI em listas grandes. Mitigação: opacity 60% / 100% conforme estado + tooltip claro.

## Esforço total estimado

~6 horas (schema + engine + API + UI + tests).
