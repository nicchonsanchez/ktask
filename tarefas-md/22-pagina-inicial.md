# Página inicial — visão pessoal de tarefas/cards/calendário

Inspiração: print do Ummense em `tarefas-md/img/` (referência visual).

## Escopo

Substituir a home atual (Dashboard de organização) por uma **visão pessoal do dia** focada nas tarefas, cards recentes e calendário do usuário logado. A home atual vira `/empresa` (mantida intacta).

### Dentro do escopo

- Nova rota `/inicio` (ou raiz `/`) com layout 2 colunas
- Card "Tarefas": atrasadas + hoje + próximas, do usuário logado
- Card "Cards recentes": carrossel horizontal dos últimos cards interagidos
- Calendário compacto do mês com pontos de tarefas/eventos por dia
- Atalho "Atualizar todas as tarefas para hoje" (mover dueDate)
- Move a home atual pra `/empresa`

### Fora do escopo (parkado)

- Eventos (PRO no Ummense — feature de agenda separada). Placeholder visual sim, lógica não
- Filtro avançado nas listas (botão `disabled`)
- Drag-and-drop de tarefas

## Layout (desktop, lg+)

```
┌───────────────────────────────────────────────┬──────────────────┐
│                                               │                  │
│  Tarefas                                      │  ← Abril 26 →    │
│  ┌─ Atrasadas (5) ───────────────────────┐    │  ┌────────────┐  │
│  │ ● [..] Tarefa 1  → SELO  22 out  👤  ⋯│    │  │  D S T Q Q │  │
│  │ ● [..] Tarefa 2  → ANEC  27 out  👤  ⋯│    │  │  29 30 31  │  │
│  │ Ver mais tarefas               atualizar│   │  │  ...       │  │
│  └────────────────────────────────────────┘    │  │  [25] hoje │  │
│                                               │  └────────────┘  │
│  ┌─ Hoje (2) ───────────────── ▓▓▓▓░ 0%──┐    │   próx 7 dias    │
│  │ ● [..] Teste 1  → Card  Hoje  👤  ⋯  │    │   sem data       │
│  │ ● [..] Teste 123 → Card  Hoje  👤  ⋯ │    │                  │
│  │ + Adicionar tarefa                    │    │                  │
│  └────────────────────────────────────────┘    │                  │
│                                               │  Eventos (PRO)   │
│  Cards recentes                               │  + Adicionar     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  →               │                  │
│  │  C │ │  C │ │  C │ │  C │                  │                  │
│  └────┘ └────┘ └────┘ └────┘                  │                  │
│                                               │                  │
└───────────────────────────────────────────────┴──────────────────┘
```

Mobile (< lg): tudo numa coluna, calendário compacto colapsado por padrão.

## Componentes

| Componente              | Responsabilidade                                    |
| ----------------------- | --------------------------------------------------- |
| `HomePage`              | Layout 2 colunas + composição                       |
| `TarefasPanel`          | Card colapsável "Tarefas" com seções Atrasadas+Hoje |
| `TarefaRow`             | Linha de tarefa (drag, check, nome, card, prazo)    |
| `CardsRecentesCarousel` | Carrossel horizontal de cards visitados             |
| `MiniCalendar`          | Calendário compacto com pontos por dia              |
| `EventosPanel`          | Placeholder (PRO/Fase 2)                            |

## Entidade "Tarefa" — gap no nosso schema

**No Ummense**, tarefa = sub-unidade de um card com:

- `name` (string)
- `dueDate` (date)
- `assigneeId` (user)
- `done` (boolean)
- `description` (rich text opcional)

**No nosso schema atual**, o equivalente mais próximo é `ChecklistItem`:

```prisma
model ChecklistItem {
  id          String
  checklistId String
  position    Float
  label       String
  isDone      Boolean
  createdAt   DateTime
}
```

Falta: `dueDate`, `assigneeId`, `description`.

### Migration necessária (Fase 1 da implementação)

```sql
ALTER TABLE "ChecklistItem"
  ADD COLUMN "dueDate"      TIMESTAMP(3),
  ADD COLUMN "assigneeId"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  ADD COLUMN "description"  TEXT;

CREATE INDEX "ChecklistItem_assigneeId_dueDate_idx"
  ON "ChecklistItem" ("assigneeId", "dueDate");
```

Plus: index pra performance do query "tarefas do user X com dueDate <= hoje".

## Endpoints novos / mudanças

### `GET /api/v1/me/tasks`

Retorna tarefas do usuário logado agrupadas:

```ts
{
  overdue: ChecklistItem[];   // dueDate < hoje, !isDone
  today:   ChecklistItem[];   // dueDate === hoje (no fuso BRT), !isDone
  next7:   ChecklistItem[];   // hoje < dueDate <= hoje+7
  noDate:  ChecklistItem[];   // dueDate IS NULL, assignedToMe
}
```

Cada item enriquecido com card pai (id, title, list.name, board.name).

### `POST /api/v1/me/tasks/bulk-reschedule-today`

Body: `{ ids: string[] }` ou `{ filter: 'overdue' }` → atualiza todos pra dueDate = hoje. Atalho do "Atualizar todas as tarefas para hoje".

### `GET /api/v1/me/recent-cards`

Cards visitados nos últimos N dias pelo user logado (precisa nova tabela `CardVisit` ou usar Activity).

### `GET /api/v1/me/calendar?month=YYYY-MM`

Pontos por dia (count de tarefas + eventos). Por enquanto só tarefas; eventos vazio.

## Plano em etapas

### Etapa 1 — Mover home atual pra `/empresa`

- Renomear rota
- Atualizar Topbar / breadcrumbs
- Sem mudança visual

### Etapa 2 — Schema + endpoints (backend)

- Migration ChecklistItem + dueDate + assigneeId + description
- Endpoints `/me/tasks`, `/me/recent-cards`, `/me/calendar`
- Atualizar UI do checklist do card pra editar dueDate/assignee/description nos itens

### Etapa 3 — Home estática (frontend)

- `HomePage` + componentes com mock data
- Validar layout e responsividade
- Acoplar nos endpoints da etapa 2

### Etapa 4 — Atalhos + interação

- "Atualizar todas pra hoje"
- Drag handle (mover entre seções? out-of-scope agora)
- Adicionar tarefa inline na seção Hoje
- Click na tarefa abre o card pai com a tarefa em foco

### Etapa 5 — Calendário

- MiniCalendar com pontos
- Seleção de dia → filtra lista
- Atalhos "Próximos 7 dias" / "Sem data"

### Etapa 6 — Eventos (PRO/Fase 2 — placeholder por enquanto)

- Renderiza vazio com "+ Adicionar" disabled
- Tag PRO

## Critérios de aceite

- [ ] Home atual movida pra `/empresa`, links/menus atualizados
- [ ] Migration ChecklistItem aplicada (dueDate, assigneeId, description)
- [ ] `GET /me/tasks` retorna tarefas agrupadas e cobre fuso BRT
- [ ] HomePage renderiza 2 colunas em desktop, 1 em mobile
- [ ] TarefaRow click → abre card pai
- [ ] "Atualizar todas pra hoje" funciona com confirmação
- [ ] MiniCalendar destaca o dia atual e marca dias com tarefas
- [ ] Carrossel de cards recentes funciona com scroll horizontal
- [ ] Sem regressões em /b/[boardId] e CardModal

## Riscos / decisões

- **ChecklistItem.assigneeId**: hoje as tarefas do checklist são "do card". Adicionar assignee individual permite delegação granular. Mantém `assigneeId` nullable pra preservar comportamento atual (item sem responsável → card.lead vira responsável implícito? Decisão pendente).
- **Default da home**: se a nova vira `/`, menus que apontavam pra dashboard precisam migrar pra `/empresa` (precisa varredura).
- **Recent cards**: tabela nova `CardVisit` é mais limpo que parsear Activity. Trade-off: 1 insert por abertura de card. Aceitar.
- **Calendar com eventos**: estrutura preparada mas só tarefas no MVP. Eventos = Fase 2 (junto com automações + WhatsApp).
- **Performance do `/me/tasks`**: index `(assigneeId, dueDate)` cobre os 4 grupos. Estimativa: <50ms até 10k tarefas.
