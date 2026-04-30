# 26 — Automações com configuração condicional

## Escopo

Permite adicionar **condições** (AND entre elas) que filtram quando uma automação executa. Inspirado no Ummense, mas indo além de só Tags.

### Dentro deste plan

- Modelo: `Automation.conditions` JSON, array de condições (AND)
- 4 tipos de condição: **Tags**, **Prioridade**, **Líder do card**, **Prazo**
- Avaliador no backend (`evaluateConditions`) acoplado à engine antes do dispatch
- UI no formulário de automação: builder visual (adicionar/editar/remover condições)
- Resumo das condições no AutomationRow da listagem
- Run skipped quando não passa nas condições (com reason "condition not met")

### Fora (fica pra futuro)

- Operador OR / grupos com parênteses (só AND no MVP)
- Condições sobre Membros, Checklist, Status do card, Janela de horário, Título contém
- Re-execução automática quando condições mudam (avalia só no trigger)

## Modelo de dados

```prisma
model Automation {
  // ... existing fields
  conditions Json? // AutomationCondition[] | null (null = sempre roda)
}
```

```ts
// AutomationCondition
type AutomationCondition = TagsCondition | PriorityCondition | LeadCondition | DueDateCondition;

interface TagsCondition {
  field: 'tags';
  operator: 'containsAny' | 'notContainsAny' | 'containsAll' | 'notContainsAll';
  value: string[]; // labelIds
}

interface PriorityCondition {
  field: 'priority';
  operator: 'is' | 'isNot' | 'isAny' | 'isNotAny';
  value: Priority[]; // sempre array, mesmo pra is/isNot (1 elemento)
}

interface LeadCondition {
  field: 'lead';
  operator: 'is' | 'isNot' | 'isAny' | 'isNotSet' | 'isSet';
  value?: string[]; // userIds; ausente nos operadores set/notSet
}

interface DueDateCondition {
  field: 'dueDate';
  operator: 'overdue' | 'dueToday' | 'dueWithinDays' | 'dueAfterDays' | 'noDueDate' | 'hasDueDate';
  value?: number; // dias, só pra dueWithinDays e dueAfterDays
}
```

## Operadores por field (UI labels)

### Tags

- `containsAny` → "Contém alguma das tags"
- `notContainsAny` → "Não contém nenhuma das tags"
- `containsAll` → "Contém todas as tags"
- `notContainsAll` → "Não contém todas as tags"

### Prioridade

- `is` → "É"
- `isNot` → "Não é"
- `isAny` → "É qualquer uma de"
- `isNotAny` → "Não é nenhuma de"

### Líder

- `is` → "É"
- `isNot` → "Não é"
- `isAny` → "É qualquer um de"
- `isSet` → "Está definido (qualquer pessoa)"
- `isNotSet` → "Não está definido (sem líder)"

### Prazo

- `overdue` → "Está atrasado"
- `dueToday` → "Vence hoje"
- `dueWithinDays` → "Vence nos próximos N dias" (input numérico)
- `dueAfterDays` → "Vence depois de N dias"
- `hasDueDate` → "Tem prazo definido"
- `noDueDate` → "Não tem prazo"

## Backend

### `evaluateConditions(card, conditions): boolean`

Pure function. Recebe um Card carregado com `labels: { labelId }[]` + `priority`, `leadId`, `dueDate`. Retorna `true` se passar em TODAS (AND vazio = passa).

### Integração na engine

Em `executeAutomation()`, **antes** de chamar `routeAction`:

```ts
const conditions = automation.conditions as AutomationCondition[] | null;
if (conditions && conditions.length > 0) {
  const card = await this.prisma.card.findUnique({
    where: { id: cardId },
    include: { labels: { select: { labelId: true } } },
  });
  if (!card || !evaluateConditions(card, conditions)) {
    await this.prisma.automationRun.update({
      where: { id: run.id },
      data: { status: 'SKIPPED', error: 'Condições não atendidas', finishedAt: new Date() },
    });
    return;
  }
}
```

### Validação Zod

Adicionar `conditions` no `CreateAutomationSchema` / `UpdateAutomationSchema` como `z.array(z.union([...])).optional().nullable()`.

## Frontend

### Componente `<ConditionsBuilder>`

Em `create-automation-form.tsx`, abaixo da seção "O que fazer":

```
┌─ Configuração condicional (opcional) ─────────────┐
│                                                    │
│ Roda só quando TODAS estas forem verdadeiras:      │
│                                                    │
│ Condição 1: [Tags ▾] [Contém alguma ▾]            │
│   Tags: [SUPORTE ×] [BUG ×] [+ adicionar]   [×]    │
│                                                    │
│ Condição 2: [Prioridade ▾] [É qualquer uma de ▾]  │
│   Valores: [HIGH ×] [URGENT ×]              [×]    │
│                                                    │
│ [ + Adicionar condição ]                           │
└────────────────────────────────────────────────────┘
```

Cada linha:

- Select **field** (Tags / Prioridade / Líder / Prazo)
- Select **operator** (filtra pelos válidos)
- Input **value** específico do field

### Resumo no `AutomationRow`

Linha extra abaixo da descrição rica, em texto `text-fg-subtle text-[10px]`:

> Se: `tags incluem SUPORTE` · `prioridade é URGENT`

Quando não há conditions, omite a linha.

## Critérios de aceite

- [ ] Migration `Automation.conditions` aplicada
- [ ] `evaluateConditions` cobre todos os 4 fields × seus operadores (tests)
- [ ] Engine pula com `SKIPPED` quando não passa, sem rodar action
- [ ] UI permite criar/editar/remover condições
- [ ] Resumo aparece no AutomationRow
- [ ] Edit de automação carrega conditions existentes
- [ ] AutomationRun.status='SKIPPED' tem `error: 'Condições não atendidas'` pra debug

## Riscos / decisões

- **AND only no MVP.** OR + grupos exigem builder mais complexo (parênteses, expression tree). Pode vir depois com migration que envolve as conditions atuais num grupo `{ all: [...] }`.
- **Conditions não disparam re-execução.** Se um card mudar e passar a satisfazer as conditions, a automação só roda no próximo trigger. Comportamento esperado e simples.
- **Tags: comparação por labelId, não nome.** Tag renomeada continua funcionando; tag deletada → operador retorna o esperado (ex: `containsAny` com label deletada = false).
- **Prazo `dueWithinDays`**: comparação em **dia BRT**, não horas. `dueDate` 23:59 hoje conta como vencido amanhã 00:00 BRT? Não — overdue só dispara se `dueDate < hojeBRT-00:00`.
