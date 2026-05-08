# Doc 41 — Dashboard de cards (indicadores)

Transformar `/indicadores/cards` num dashboard de operação útil:
filtros, métricas de saúde do fluxo (lead time, aging, WIP), e
visualizações que mostram tendências em vez de só fotos.

A página atual tem KPIs genéricos sem filtro nem comparativo
temporal — útil pra "quanto tem no total" mas não pra "estamos
melhorando ou piorando".

## Escopo

### Entra

- **Filtros** no topo: período (7d/30d/90d/12m/custom), fluxo (multi),
  líder (single), prioridade (multi). Persistem na URL (deep-link).
- **6 KPIs com sparkline + delta** vs período anterior:
  - Lead time médio
  - Throughput (cards finalizados no período)
  - % no prazo (cards completados antes do dueDate)
  - WIP (cards ativos agora)
  - Atrasados (cards ativos com dueDate < hoje)
  - Cards reabertos (qualidade de entrega)
- **Entrada vs Saída**: linha dupla (cards criados vs finalizados/dia).
  Aproximação leve do CFD; mostra se a carga está crescendo.
- **Saúde por coluna**: barra horizontal com WIP atual + tempo médio
  desde que cada card entrou na coluna. Identifica gargalos.
- **Aging cards**: tabela com 3 buckets (parados há 7+/30+/60+ dias
  sem atualização). Lista os top N de cada bucket com link pro card.
- **Distribuições** (já existem 3, adicionar 1):
  - Por prioridade (atual)
  - Por fluxo (atual)
  - Top líderes (atual)
  - **Por etiqueta** (novo) — top 10 labels usadas em cards ativos
- **Stats históricos secundários** (já existem) — manter no rodapé.

### Fica fora

- **CFD verdadeiro** (snapshot diário do estado de cada card).
  Caro de calcular sem job offline; "Entrada vs Saída" aproxima
  na V1.
- **Histograma de lead time**: o KPI já mostra média; histograma
  agrega valor marginal pra V1.
- **Heatmap por dia da semana / hora**: V2.
- **Drill-down ao clicar em KPI**: V2 (lista os cards que compõem
  o número).
- **Comparação de períodos lado-a-lado**: V2 (já temos delta no card).

## Decisões

### Por que estender `cardsStats` em vez de criar endpoints novos

A página é única e os dados são correlacionados (filtros aplicam
em tudo). Endpoint único `GET /api/v1/admin/stats/cards` aceitando
query params evita N requisições paralelas. TanStack Query separa
caches por queryKey (params) naturalmente.

Trade-off: payload mais gordo. Aceitável — ~10-15 KB compactado.

### Cálculo de "tempo desde que entrou na coluna"

Sem snapshot histórico, calcular tempo médio em coluna na vida
inteira do card é caro (precisa percorrer todos os `Activity
CARD_MOVED`). Aproximação V1:

> Para cards **ativos**: tempo = `now - max(movedAt em CARD_MOVED
pra esta listId)` ou `now - createdAt` se nunca foi movido.

Mostra "há quanto tempo cada coluna está segurando trabalho", que
é o que o gestor quer ver.

### Aging por `updatedAt` (não Activity)

`Card.updatedAt` é alterado por qualquer mudança (drag, edit,
comment, label, etc). Bom proxy de "atividade" sem custo extra.
Activity log pode ser usado se precisarmos diferenciar tipos de
update na V2.

### Taxa no prazo

`completedAt <= dueDate` com `dueDate IS NOT NULL`. Cards sem
dueDate são excluídos do denominador (não dá pra dizer que
"estavam no prazo" se não havia prazo).

### Reabertura

Conta Activity `CARD_REOPENED` no período / completions no mesmo
período. Métrica de qualidade — alto = retrabalho.

## Etapas

### 1. Backend — estender `cardsStats`

[`apps/api/src/modules/admin/admin.service.ts`](apps/api/src/modules/admin/admin.service.ts)
recebe params opcionais:

```ts
interface CardsStatsParams {
  from?: Date; // padrão: 30 dias atrás
  to?: Date; // padrão: agora
  boardIds?: string[];
  leadId?: string;
  priorities?: Priority[];
}
```

Adicionar ao retorno:

```ts
{
  // já existem
  summary: { ..., wip, completedInPeriod, reopenedInPeriod, onTimeRate },
  byPriority, byBoard, topLeads, throughput,

  // novos
  byLabel: Array<{ label, count }>,
  leadTime: { avgDays, medianDays, p95Days },
  aging: {
    buckets: { stale7: number, stale30: number, stale60: number },
    samples: Array<{ id, title, board, lastActivityDays }>, // top 10
  },
  byColumn: Array<{
    list: { id, name, boardId, boardName },
    wip: number,
    avgDaysInColumn: number,
  }>,
  flowInOut: Array<{ day: string, created: number, completed: number }>,
  // sparkline data pros KPIs (7 dias por padrão)
  sparkline: {
    leadTime: number[],
    throughput: number[],
    wip: number[],
    overdue: number[],
    onTimeRate: number[],
    reopened: number[],
  },
  // delta vs período anterior (mesmo tamanho)
  delta: {
    leadTime: number,    // % change (positive = piorou)
    throughput: number,  // % change
    wip: number,
    overdue: number,
    onTimeRate: number,
    reopened: number,
  },
}
```

### 2. Frontend — `lib/queries/indicators.ts`

Estender `CardsStats` interface com os campos novos. `cards()`
aceita params (`from`, `to`, `boardIds[]`, `leadId`, `priorities[]`)
e serializa pra query string.

### 3. Frontend — refatorar `/indicadores/cards/page.tsx`

Layout final:

```
┌─ FilterBar ──────────────────────────────────────────────────┐
│ [7d|30d|90d|12m|Custom] · Fluxo▾ · Líder▾ · Prioridade▾ ─── │
├─ KPIs (6 cards com sparkline + delta) ───────────────────────┤
│ Lead time · Throughput · No prazo · WIP · Atrasados · Reab.  │
├─ Entrada vs Saída (linha dupla 30d) ─────────────────────────┤
├─ Saúde por coluna (barras WIP + tempo médio) ────────────────┤
├─ Aging cards (3 buckets + top 10) ───────────────────────────┤
├─ Distribuições (4 cards lado-a-lado em grid 2x2) ────────────┤
│  Prioridade · Fluxo · Líderes · Etiquetas                    │
└─ Stats históricos (Total · Concluídos · Arquivados) ─────────┘
```

Componentes:

- `<FilterBar />` — sticky no topo, atualiza URL
- `<KpiCard />` — número grande + delta arrow + sparkline minúsculo
- `<FlowInOutChart />` — SVG simples com 2 polylines
- `<ColumnHealthList />` — barras horizontais
- `<AgingTable />` — tabela compacta agrupada por bucket
- `<SparklineSvg />` — 50×16px reutilizável

### 4. Tests / Validação

- Manual: navegar pela página com vários filtros, verificar URLs,
  números coerentes.
- Typecheck + lint nos dois pacotes.
- Smoke test em prod após deploy.

## Critérios de aceite

- [ ] Filtros (período, fluxo, líder, prioridade) atualizam a URL
      e refletem em todas as métricas
- [ ] 6 KPIs no topo com sparkline + delta vs período anterior
- [ ] "Entrada vs Saída" mostra linha dupla dos últimos 30 dias
- [ ] "Saúde por coluna" lista WIP + tempo médio na coluna por
      lista (top 10)
- [ ] "Aging cards" mostra 3 buckets (7d/30d/60d) + top 10 cards
      mais antigos sem atualização
- [ ] Distribuições mostram prioridade, fluxo, líderes e etiquetas
- [ ] Typecheck + lint verdes
- [ ] Smoke test em prod verde

## Riscos / decisões em aberto

- **Performance da query**: vários `groupBy` + raw SQL podem
  ficar lentos em orgs grandes. Mitigação: índice composto em
  `Card(organizationId, completedAt)` e `Card(organizationId,
isArchived, updatedAt)` — checar EXPLAIN se passar de 500ms.
- **Tempo em coluna sem snapshot**: aproximação por último move
  pode subestimar (cards que voltaram pra coluna anterior). V2
  pode adicionar snapshot job offline.
- **Sparkline com 0 cards**: KPIs de % (% no prazo) ficam undefined
  com denominador 0. Mostrar "—" em vez de "0%".
