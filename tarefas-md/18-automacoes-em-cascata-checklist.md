# Automações em cascata: lista e item de checklist criados por automação

> Hoje uma automação de coluna pode criar uma checklist + itens (`INSERT_CHECKLIST_GROUP`), mas os itens criados não vêm com automações próprias. User tem que ir card por card adicionar automação manualmente em cada item ou lista. Solução: permitir configurar, dentro da automação-pai, automações que serão **automaticamente anexadas** à lista criada e a cada item.

## Decisões

1. **2 escopos** já existentes no schema (`Automation.scopeChecklistId` e `scopeChecklistItemId`) — reaproveitar.
2. **Triggers permitidos**:
   - Item: `CHECKLIST_ITEM_DONE`
   - Lista: `CHECKLIST_COMPLETED`
3. **Ações permitidas**: qualquer ação atual (mesmo conjunto que o user usa hoje pra automações manuais).
4. **Compat**: configs antigos (sem os novos campos) continuam funcionando — campos opcionais.
5. **Triggers de nível de card** (`CARD_ENTERED` etc) **não fazem sentido** em escopo de item/lista — filtrar.
6. **Recursão**: se a sub-automação tem `INSERT_CHECKLIST_GROUP` como ação, a engine roda normalmente — `chainDepth` já protege contra loops infinitos.

## Etapas

### 1. Backend — DTO/Zod

`apps/api/src/modules/automations/dto/automation.schemas.ts`:

```ts
const NestedChecklistAutomationSchema = z.object({
  trigger: z.enum(['CHECKLIST_ITEM_DONE', 'CHECKLIST_COMPLETED']),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actionType: AutomationActionTypeSchema,
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  conditions: AutomationConditionsSchema.optional().nullable(),
  label: z.string().max(120).trim().optional(),
});
```

Validação adicional: `scope item` aceita só `CHECKLIST_ITEM_DONE`; `scope list` aceita só `CHECKLIST_COMPLETED`. Pode ser refine no schema ou validado no handler.

Esse schema é só pra documentação — o `actionConfig` em si segue `record(string, unknown)`. Validação real fica no engine handler.

### 2. Backend — interfaces estendidas

`automations.engine.ts`:

```ts
interface NestedChecklistAutomation {
  trigger: 'CHECKLIST_ITEM_DONE' | 'CHECKLIST_COMPLETED';
  triggerConfig?: Record<string, unknown>;
  actionType: AutomationActionType;
  actionConfig?: Record<string, unknown>;
  conditions?: AutomationCondition[];
  label?: string;
}

interface ChecklistItemConfig extends ChecklistDefaultsConfig {
  text: string;
  itemAutomation?: NestedChecklistAutomation; // NEW
}

interface ChecklistItemsActionConfig extends ChecklistDefaultsConfig {
  checklistTitle?: string;
  items?: Array<string | ChecklistItemConfig>;
  listAutomation?: NestedChecklistAutomation; // NEW
}
```

### 3. Backend — handler INSERT_CHECKLIST_GROUP

Após criar `Checklist`:

```ts
if (config.listAutomation) {
  await this.prisma.automation.create({
    data: {
      organizationId: card.organizationId,
      boardId: card.boardId,
      scopeChecklistId: checklist.id,
      trigger: config.listAutomation.trigger,
      triggerConfig: config.listAutomation.triggerConfig ?? {},
      actionType: config.listAutomation.actionType,
      actionConfig: config.listAutomation.actionConfig ?? {},
      conditions: config.listAutomation.conditions ?? null,
      label: config.listAutomation.label ?? null,
      isActive: true,
      createdById: automation.createdById, // herda do criador da pai
    },
  });
}
```

Após criar cada `ChecklistItem` (uso `createMany` atual perde os IDs — preciso criar individualmente quando item tem automação):

```ts
// Quando algum item tem itemAutomation, troca createMany por loop individual
const itemsWithAuto = parsedItems.filter((it) => it.itemAutomation);
if (itemsWithAuto.length === 0) {
  await this.prisma.checklistItem.createMany({ data: rows });
} else {
  // Cria 1 por 1 pra obter os IDs e criar as automações junto
  for (const row of rows) {
    const created = await this.prisma.checklistItem.create({ data: row });
    const cfg = parsedItems.find((it) => it.text === created.text)?.itemAutomation;
    if (cfg) {
      await this.prisma.automation.create({
        data: {
          organizationId: card.organizationId,
          boardId: card.boardId,
          scopeChecklistItemId: created.id,
          trigger: cfg.trigger,
          triggerConfig: cfg.triggerConfig ?? {},
          actionType: cfg.actionType,
          actionConfig: cfg.actionConfig ?? {},
          conditions: cfg.conditions ?? null,
          label: cfg.label ?? null,
          isActive: true,
          createdById: automation.createdById,
        },
      });
    }
  }
}
```

Mesma lógica em `handleInsertChecklistItems` (que reaproveita checklist).

### 4. Frontend — Botão na lista

`create-automation-form.tsx`, no nível da seção "Nome da lista de tarefas":

- Adicionar botão `<Bot />` ao lado direito do input do título da lista.
- State `listAutomation: NestedAutomation | null`.
- Click abre popover com form.

### 5. Frontend — Botão no item

No `ChecklistItemRow`, adicionar 4º IconBtn `<Bot />` (depois de Responsável/Prazo/Prioridade):

- State `itemAutomation: NestedAutomation | null` por item.
- Click abre popover similar ao da lista, mas trigger fixo em `CHECKLIST_ITEM_DONE`.

### 6. Frontend — Popover form

Componente novo `NestedAutomationPopover`:

- Trigger: fixo (lista=CHECKLIST_COMPLETED, item=CHECKLIST_ITEM_DONE) — esconder o select.
- ActionType: dropdown com todas as ações disponíveis.
- ActionConfig: reusar editor por action type que já existe.
- Conditions: opcional (botão "Adicionar condição").
- Botão "Remover automação" se já tem config.

### 7. Tutorial

`apps/web/content/ajuda/automacoes/04-automacoes-em-cascata.md`:

- Explicar os 2 níveis (lista + item).
- Exemplos: "Quando card entra em A fazer → cria lista 'Aprovação' com itens, e cada item já tem automação 'notificar @resp por WhatsApp quando marcado'".

## Critérios de aceite

- [ ] Form da automação mostra botão Bot ao lado do título da lista.
- [ ] Cada item de checklist tem 4 botões (Responsável, Prazo, Prioridade, Automação).
- [ ] Configurar listAutomation + salvar → editar → vê config preservada.
- [ ] Idem pra itemAutomation.
- [ ] Trigger da automação criada na engine: Checklist → CHECKLIST_COMPLETED, Item → CHECKLIST_ITEM_DONE.
- [ ] Quando a automação roda em prod, os Automation rows aparecem na lista de automações do quadro com os escopos certos.
- [ ] Compat: automações antigas sem os novos campos continuam funcionando.
- [ ] Typecheck + lint + tests verdes.

## Riscos / decisões

- **createMany vs create loop**: perda de performance pequena quando há automação por item (1 INSERT por item em vez de bulk). Aceitável porque o caso é raro e os checklists têm tipicamente 5-20 itens.
- **Filtro de triggers no UI**: popover lista só ações relevantes. Algumas ações como `INSERT_CHECKLIST_GROUP` em escopo de item podem virar loops — confiamos no `chainDepth` da engine.
- **Edição da automação-pai**: ao editar `INSERT_CHECKLIST_GROUP`, mudanças nos sub-automations afetam SÓ futuras execuções. Checklists/items/automações já criados em rodadas anteriores não mudam — comportamento esperado pra qualquer automação.

## Follow-ups

- Possibilidade de o item ter MAIS de 1 automação (hoje permitimos só 1 por item via config — backend aceita N via INSERT manual depois).
- Templates de "lista com automações" reaproveitáveis entre automações-pai.
