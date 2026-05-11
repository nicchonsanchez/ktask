# Doc 47 — Automações Ummense pendentes de implementação

Inventário das 156 automações dos templates Ummense (139 ativas) e o que
ainda não conseguimos importar/executar no KTask. Status em 2026-05-11.

## Status geral

| Status                                         | Total   | Ativas  |
| ---------------------------------------------- | ------- | ------- |
| Importadas e funcionando (dry-run)             | 97      | 97      |
| Pendentes (handler ou action novo)             | 32      | 32      |
| Não importáveis por falta de user/tag no KTask | ~27     | ~10     |
| **Total**                                      | **156** | **139** |

> 97 é o número confirmado por dry-run em 2026-05-11; difere do total mapeável
> teórico (~126) porque algumas automações referenciam usuários/tags Ummense
> que não foram migrados pro KTask (ex: FABIO JOSE MACHADO, tag "Aprovação arte").

Importer: `scripts/import-ummense-automations.mjs` (roda com `DRY_RUN=1`
pra inspecionar antes).

---

## Pendentes — por tipo

### 1. AutomationAlertTimeExceeded (13 ativas)

Marca card visualmente quando excede tempo limite. Ummense usa
`structure: { bg_color: 'bg-orange1' }`.

**Boards afetados**: Redes Sociais (7), Blogs & Conteúdos (2), ANEC (4).

**Implementação proposta no KTask:**

- Adicionar handler `FLAG_OVERDUE` no `automations.engine.ts` (já existe
  como action type, falta o handler — cai em `skipped: true`).
- Trigger a usar: `TIME_IN_LIST` com `triggerConfig.minutes`.
- `actionConfig` esperado: `{ flagColor: 'orange' | 'red', flagText?: string }`
  ou similar. Precisa adicionar campo `flag` no `Card` (cor + texto opcional).
- Activity log: `CARD_FLAGGED`.

Esforço estimado: 1 dia (campo no schema + handler + UI do flag no card).

---

### 1b. AutomationAlertTodayDueDate (2 ativas)

Descoberto durante o dry-run. Alerta quando a data de vencimento é hoje.
Provavelmente similar ao AlertTimeExceeded mas com gatilho diferente
(due_date == today em vez de tempo na coluna).

**Boards afetados**: Redes Sociais (provável — 2 ocorrências).

**Implementação proposta:**

- Mesmo handler `FLAG_DUE_TODAY` (action type já existe; falta handler).
- Trigger: `DUE_DATE_TODAY`.

Esforço estimado: incluso no item 1 (mesma feature de flag visual).

---

### 2. AutomationAlertLastInteraction (4 ativas)

Como o anterior, mas alerta quando o card fica sem interação por X tempo.
`structure: { bg_color: 'bg-orange1' }`.

**Boards afetados**: Atendimento (2), ANEC (2).

**Implementação proposta:**

- Mesmo handler `FLAG_OVERDUE` do item 1, mas com trigger
  `TIME_NO_INTERACTION`.
- O scheduler `automations.scheduler.ts` já varre cards sem interação;
  só falta wirar a action.

Esforço estimado: junto com item 1.

---

### 3. AutomationSendEmail (7 ativas, 4 inativas)

Envia email com placeholders dinâmicos (`{nome_do_card}`,
`{nome_do_destinatario}`, etc.).

**Boards afetados**: ANEC (4), KHARIS (3).

**Ummense structure:**

```json
{
  "smtp": 646,
  "recipients": [{ "name": "Lider da coluna", "value": "project_leader_column" }],
  "subject": "ANEC: Novo card para PRODUÇÃO",
  "body": "<p>Olá {nome_do_destinatario}!</p>...",
  "files": []
}
```

**Implementação proposta:**

- Handler `SEND_EMAIL` (action type já existe; falta handler — cai em
  `skipped: true`).
- Reusar `MailService` (já em prod pra reset de senha).
- Resolver placeholders Ummense → KTask:
  - `{nome_do_card}` → `card.title`
  - `{nome_do_destinatario}` → resolver de `recipients[].value` (project_leader_column → list leader, etc.)
  - `{cliente}` → `card.contact.name` se houver
- Destinatários: enum `LEAD | TEAM | LIST_LEADER | CUSTOM_EMAIL`.

Esforço estimado: 2 dias.

---

### 4. AutomationAddCustomFieldsInProject (1 ativa)

Preenche um custom field no card. KTask **não tem custom fields** ainda.

**Board afetado**: Comercial AGÊNCIA Kharis (1).

**Implementação proposta:**

- Feature maior — adicionar `CustomField` model no Prisma:
  - Board-scoped (cada board define seus campos).
  - Tipos: TEXT, NUMBER, DATE, SELECT, MULTI_SELECT, USER.
- Endpoint CRUD `/boards/:id/custom-fields`.
- Tabela `CardCustomFieldValue { cardId, fieldId, value }`.
- Handler `FILL_FIELDS` (action type já existe).
- UI no card-modal pra editar valores.

Esforço estimado: 5-7 dias (feature substancial). Só vale se houver
demanda real além desse 1 caso.

---

### 5. AutomationUpdateStep (1 ativa, 1 inativa)

Move o card pra outra coluna (e possivelmente outro flow).
Ummense structure inclui `flow_id`, `flow_column_id`, `isFinishFlow`.

**Board afetado**: Redes Sociais (2).

**Exemplo real**: quando card em "⚠️ Copies prontos" tem tag URGENTE,
move pra "🚩 Aprovação Copy".

**Implementação proposta:**

- Adicionar action type novo `MOVE_CARD` no `AutomationActionTypeSchema`.
- Handler: usa endpoint existente `/cards/:id/move` ou move direto via
  Prisma.
- `actionConfig`: `{ targetListId: CUID, position?: 'TOP' | 'BOTTOM' }`.
- Considerar se vale também `targetBoardId` (cross-board move) — Ummense
  permite com `isFinishFlow`, KTask precisa decidir semântica
  (multi-board: cria CardPresence em outro board? move?).

Esforço estimado: 1-2 dias (com cross-board MVP) ou 0.5 dia (mesmo board).

---

### 5b. REQUEST_APPROVAL — auto-pedido de aprovação (novo)

Não vem do Ummense — é uma melhoria identificada em discussão com o
operador (2026-05-11). Cenário: card entra na coluna "🚩 Aprovação Copy"
→ sistema cria automaticamente um `CardApproval` e envia link tokenizado
pro cliente, sem precisar do botão manual.

**Implementação proposta:**

- Adicionar `REQUEST_APPROVAL` ao enum `AutomationActionType` (Prisma +
  Zod schema).
- Handler `handleRequestApproval` no engine que:
  - Cria `CardApproval` via `approvals.service.create()`.
  - Resolve destinatários do `actionConfig`:
    - `recipientType: 'CARD_CONTACT'` → usa Card.contactEmail
    - `recipientType: 'CARD_LEAD'` → usa o líder atual
    - `recipientType: 'CUSTOM'` → emails fixos no config
  - Envia email com link tokenizado (já infraestrutura via MailService).
- `actionConfig` shape:
  ```ts
  {
    recipientType: 'CARD_CONTACT' | 'CARD_LEAD' | 'CUSTOM',
    customEmails?: string[],
    expiresInDays?: number,  // default 7
    messageTemplate?: string,  // com placeholders {nome_card}, etc.
    skipIfPendingExists?: boolean  // default true — evita duplicar
  }
  ```
- Conditions: aproveitam o sistema existente (tags, lead, dueDate).
- UI: item no `create-automation-form.tsx` com seleção de destinatário.

**Casos de uso:**

- _Quando card entra em "Aprovação Copy" com tag "Cliente VIP" → solicitar aprovação automática pro contato do card_
- _Quando card entra em "Aprovação material" sem tag "Rascunho" → solicitar aprovação pra emails fixos do cliente_

Esforço estimado: ~1 dia (Prisma + Zod + handler + UI + spec).

---

### 6. AutomationCreateProjectParent (1 ativa)

**Atenção: semântica invertida.** Ummense cria card-PAI quando o
card-filho entra na coluna. KTask só tem `CREATE_CHILD_CARD` (cria filho).

**Board afetado**: Blogs & Conteúdos (1).

**Exemplo**: card "Copy para E-mail Marketing" entra na coluna →
cria card-pai "[nome do card] - Blog" no fluxo Redes Sociais → Design.

**Decisão**: por ora pular. Caso de uso raro (1 ocorrência) e a
inversão deixa o mapeamento confuso. Se virar demanda, adicionar
action type `CREATE_PARENT_CARD` no schema.

Esforço estimado: 1 dia (similar ao CREATE_CHILD, mas inverte o
`parentCardId`).

---

## Priorização sugerida

1. **REQUEST_APPROVAL** (novo) — alto valor, 1 dia. Automatiza o passo
   manual de "enviar pra aprovação" que toda coluna 🚩 do Ummense
   fazia implicitamente. Habilita workflows fim-a-fim sem intervenção.

2. **AutomationAlertTimeExceeded + AlertLastInteraction + AlertTodayDueDate**
   (19 ativas) — alto impacto, baixo esforço. 1 dia. Feature de flag visual.

3. **AutomationSendEmail** (7 ativas) — médio impacto. 2 dias. Templates
   da ANEC e KHARIS são usados em comunicação real com cliente.

4. **AutomationUpdateStep** (2 ativas) — baixo impacto agora, mas é
   bom ter pra automação de fluxo. 1 dia (mesmo board).

5. **Custom Fields** (1 ativa) — só se houver demanda além desse caso.
   5-7 dias.

6. **CreateProjectParent** (1 ativa) — pular por ora.

**Total prioridade alta+média (1+2+3+4): ~5 dias** pra cobrir 28 das 30
automações pendentes Ummense + REQUEST_APPROVAL como bônus.

---

## Validações pós-implementação

Pra cada handler novo:

- Spec unitário em `automations.engine.spec.ts`
- Teste manual: criar automação na UI, mover card pra coluna, verificar action
- Activity log gerado corretamente
- Re-rodar `scripts/import-ummense-automations.mjs` (sem `DRY_RUN`) — o tipo
  vai sair da lista `unsupportedTypes` e ser importado.

## Como descobrir status atual

Pra ver o estado real de importação (passa 30 segundos):

```bash
DRY_RUN=1 node scripts/import-ummense-automations.mjs
```

A seção "Tipos nao-suportados" do relatório mostra exatamente o que ainda
precisa ser implementado.
