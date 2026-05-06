# Doc 40 — Monitoramento de equipe

Permitir que GESTOR+ (ADMIN, OWNER) visualize o estado de cada
membro da org: o que está pendente, atrasado, vencendo, e abrir
a "home pessoal" do membro pra inspeção mais detalhada.

A home pessoal hoje (`/`) mostra Tarefas, Cards Recentes, Calendário
e Eventos do user logado. A ideia é reaproveitar essa mesma UI no
modo "ver como" (`/?as=<userId>`), com banner de contexto, em vez
de duplicar componentes.

## Escopo

### Entra

- Enriquecer [/empresa](<apps/web/src/app/(app)/empresa/page.tsx>)
  com contadores por membro (Pendentes / Atrasados / Vence hoje)
  visíveis apenas pra GESTOR+
- Botão "Ver como" em cada linha → `/?as=<userId>` carrega a home
  do membro selecionado
- Banner persistente no topo da home enquanto em modo "ver como"
  ("Visualizando como Nicchon · Sair do modo")
- Backend: novas rotas `/api/v1/users/:userId/...` paralelas a
  `/api/v1/me/...` (tasks, recent-cards, calendar), com guard de
  role e filtro implícito por `BoardAccess` do gestor que está
  visualizando
- Endpoint de resumo: `GET /api/v1/users/:userId/summary` retornando
  `{ pending, overdue, dueToday, recentActivityCount }`
- Filtro por board no modo "ver como" (dropdown no banner) — filtra
  cards do membro pra um fluxo específico
- Aba "Atividade recente" no modo "ver como" — últimos 10 cards
  que o membro mexeu (movimentos, comentários, status changes)

### Fica fora

- Histórico de desempenho ao longo do tempo (throughput, tempo médio
  em coluna, burndown) — já mora em `/indicadores`, mantém separado
- Comparação lado-a-lado de múltiplos membros (ranking) — pode entrar
  como V2 se o gestor sentir falta na prática
- Edição de cards do membro pelo modo "ver como" (read-only inicial;
  V2 pode liberar edição se o gestor tem permissão de board)
- Notificações em tempo real de atividade do membro (V2)

## Decisões

### Privacidade vs visibilidade

Gestor só vê cards de boards onde **ele próprio** é membro/visualizador.
Boards PRIVATE onde o gestor não tem acesso ficam invisíveis no
contador também — sem isso, gestor descobriria por agregação que
existe trabalho oculto.

Implementação: queries usam `BoardAccessService.getAccessibleBoardIds(gestorId)`
**E** `where.assignees.some(userId: targetUserId)` — interseção dos
dois conjuntos.

### Por que rotas novas em `/users/:userId/...` em vez de `?asUserId=`

Endpoint `/me/tasks` carrega semântica "minhas tarefas como user atual".
Aceitar `?asUserId=` quebra essa semântica e bagunça os caches do
TanStack Query (mesma URL, dados diferentes por param).

Mais limpo: rotas paralelas `/users/:userId/tasks` que aceitam o ID
explicitamente, têm OrgRoleGuard(GESTOR+) + BoardAccess no service.
TanStack Query separa por queryKey natural.

### Restrição de role

- MEMBER: vê `/empresa` como hoje (lista + role badge), sem contadores
- GESTOR / ADMIN / OWNER: vê contadores + botão "Ver como"

Backend: `OrgRoleGuard('GESTOR')` no controller das rotas novas.
Frontend: condicional na renderização (já temos `myRole` no
`useAuthStore`).

## Etapas

### 1. Backend — endpoints novos

Criar módulo `users-view` (ou estender `me/`) com:

- `GET /api/v1/users/:userId/summary` →
  `{ pending: number, overdue: number, dueToday: number, recentActivityCount: number }`
- `GET /api/v1/users/:userId/tasks` (mesmo shape de `MeTasksResponse`)
- `GET /api/v1/users/:userId/recent-cards`
- `GET /api/v1/users/:userId/calendar?month=YYYY-MM`
- `GET /api/v1/users/:userId/recent-activity?limit=10` (novo —
  últimas atividades onde `actorId = userId`)

Guard: `JwtAuthGuard + TenantGuard + OrgRoleGuard('GESTOR')`.

Filtro implícito no service:

```ts
const accessibleBoardIds = await this.boardAccess.listAccessibleBoardIds(
  viewerId, tenant
);
where: {
  assignees: { some: { userId: targetUserId } },
  card: { boardId: { in: accessibleBoardIds } },
}
```

Validação: `targetUserId` precisa ser membro da mesma org do `viewerId`,
senão 404. Não 403 — não confirma se o user existe em outra org.

### 2. Backend — endpoint agregado por org

`GET /api/v1/organizations/members/summary` →
`Array<{ userId, pending, overdue, dueToday }>`

Uma única query agrupada (`groupBy` ou raw SQL) pra evitar N+1 ao
listar 20 membros. Respeita BoardAccess do gestor que chama.

### 3. Frontend — meQueries paralelas (`userViewQueries`)

Criar [`apps/web/src/lib/queries/user-view.ts`](apps/web/src/lib/queries/user-view.ts)
com:

- `userViewQueries.tasks(userId)`
- `userViewQueries.recentCards(userId)`
- `userViewQueries.calendar(userId, month)`
- `userViewQueries.summary(userId)`
- `userViewQueries.recentActivity(userId)`
- `orgMembersSummaryQuery` (pro `/empresa`)

### 4. Frontend — `/empresa` com contadores

Em [`apps/web/src/app/(app)/empresa/page.tsx`](<apps/web/src/app/(app)/empresa/page.tsx>):

- Carregar `orgMembersSummaryQuery` em paralelo com `membersQuery`
- Pra cada linha, renderizar 3 badges coloridas: Pendentes (cinza),
  Vence hoje (amarelo), Atrasados (vermelho)
- Se contador > 0, badge fica clicável e leva pra
  `/?as=<userId>&filter=overdue` (deep link)
- MEMBER: badges não aparecem
- Botão "Ver como" inline ao lado do "Timesheet" atual

### 5. Frontend — modo "ver como" na home

Em [`apps/web/src/app/(app)/page.tsx`](<apps/web/src/app/(app)/page.tsx>):

- Ler `?as=<userId>` da URL
- Se presente E gestor+: renderizar componentes da home com prop
  `viewAsUserId` (ou usar context `<ViewAsProvider>`)
- Banner sticky no topo: "Visualizando como **{nome}** ·
  [Sair do modo](/)"
- Cada componente da home (`TarefasPanel`, `CardsRecentesCarousel`,
  `MiniCalendar`, `EventosPanel`) aceita `viewAsUserId?: string` —
  se presente, usa `userViewQueries`, senão `meQueries`
- Modo read-only: ações de edição (rescheduler, complete, etc.) ficam
  desabilitadas com tooltip "Modo visualização"

### 6. Frontend — filtro por board no modo "ver como"

Dropdown ao lado do banner: "Todos os fluxos" / "Apenas: Marketing".
Filtra client-side as listas (não precisa endpoint novo — os
endpoints já retornam `card.boardId`).

### 7. Frontend — aba "Atividade recente"

Nova seção/aba na home **só** em modo "ver como" (não polui home
do user logado). Lista os últimos 10 eventos do membro: "moveu
'Card X' pra 'Concluído' há 2h", "comentou em 'Card Y' ontem".

Componente novo: `<UserRecentActivity userId={x} />`.

### 8. Auditoria — log do "ver como"

Cria `Activity { type: 'USER_VIEWED', actorId: gestorId, targetUserId,
metadata: { viewedAt } }` toda vez que gestor abre modo "ver como".
Não bloqueia, é fire-and-forget. Usado em V2 pra dashboard "quem
foi monitorado".

(Opcional na V1 se quiser ir mais rápido — pode pular.)

### 9. Testes

- E2E (Playwright): gestor acessa `/empresa`, vê contadores; clica
  em "Ver como" e vê banner + dados do membro; logout e login como
  MEMBER comum: contadores não aparecem.
- Unitário no service: filtro de BoardAccess corta cards de board
  privado inacessível.

### 10. Deploy

Commit único cobrindo backend + frontend. Não tem migration de
banco (todos os dados já existem). Push → deploy automático na
VM Hetzner.

## Critérios de aceite

- [ ] Como GESTOR+ vejo contadores Pendente/Atrasado/Vence-hoje em
      cada linha de `/empresa`
- [ ] Como MEMBER comum NÃO vejo os contadores
- [ ] Como GESTOR+ clico em "Ver como" e a home renderiza com os
      dados do membro selecionado
- [ ] Banner "Visualizando como X" aparece sticky no topo
- [ ] "Sair do modo" volta pra `/` (minha home normal)
- [ ] Filtro por board funciona no modo "ver como"
- [ ] Aba "Atividade recente" lista últimos eventos do membro
- [ ] Cards de boards privados onde o gestor não tem acesso NÃO
      aparecem nem nos contadores nem na home "ver como"
- [ ] Modo "ver como" é read-only (botões de ação desabilitados)
- [ ] Typecheck + lint verdes; testes existentes não quebram
- [ ] Deploy em prod e smoke test verde

## Riscos / decisões em aberto

- **Performance da home agregada**: 20+ membros × 4 queries cada =
  pode ficar lenta. Mitigação: endpoint `members/summary` agregado
  numa query (etapa 2).
- **Cache do TanStack Query**: cada `userViewQueries.tasks(userId)`
  vira queryKey separada; em org grande pode acumular. Setar
  `staleTime: 30s` e deixar GC default cuidar.
- **Permissão de visualizar atividade**: gestor vê comentários do
  membro em cards privados onde só o membro tem acesso? Decisão
  V1: não — Activity respeita BoardAccess do gestor (igual cards).
  Atividade em board inacessível é filtrada.
- **`/empresa` ficar muito carregado**: hoje é uma tela enxuta
  ("Org + papel + membros"). Adicionar contadores pode poluir.
  Mitigação: badges discretas, só números (sem texto), e só pra
  GESTOR+. MEMBER continua vendo a tela enxuta.
- **Mobile**: contadores em 3 badges + botões "Timesheet" + "Ver
  como" pode estourar a linha em telas pequenas. Plano: empilhar
  abaixo do nome em `<sm`, e talvez esconder "Timesheet" atrás de
  ícone só.
