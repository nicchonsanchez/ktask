# 25 — Privacidade por card

> **Status (2026-05-05):** V1 em implementação. Desparkado a pedido do
> user — uso interno cresceu, alguns cards precisam ser visíveis só pra
> líder + equipe (ex: discussão sensível com cliente, salário, RH).

## Motivação

Ummense suporta níveis de visibilidade POR CARD além do board:

- `public` — todos do board veem
- `private-team-edit` — só Líder + Equipe veem e editam
- `private-team-view` — só Líder + Equipe veem; ninguém edita exceto líder
- `private-only-lead` — só o Líder vê

CSV exportado preserva esse campo (col 8 do exporter).

## Por que parkar

1. Em equipe interna pequena (5-10 pessoas), 90% dos cards são públicos
2. Quando há sensibilidade, quase sempre o board inteiro é privado já — granularidade por card é raramente útil
3. Adiciona complexidade significativa em queries (todo `findMany` de cards precisa filtrar por privacidade do user atual)
4. Sem caso de uso concreto reportado pela equipe Kharis

## Quando reabrir

- Aparecer um caso real ("essa tarefa de RH é confidencial pro líder")
- KTask virar SaaS com clientes em equipes mistas
- Importer Ummense (doc 16) começar a perder dados sensíveis nessa coluna que façam diferença

## Estimativa quando rodar

~4-6h:

- Schema: `Card.privacy enum (PUBLIC, TEAM_EDIT, TEAM_VIEW, LEAD_ONLY)`
- Filtro em todos os endpoints de listagem (boards, cards, search, indicadores)
- UI: ícone de cadeado no card-mini quando não-public; seletor no modal
- Activity entry quando muda privacidade

## V1 entregue (escopo reduzido)

Pra controlar complexidade, V1 foca no caminho mais simples:

- **2 níveis** ao invés de 4: `PUBLIC` (default) e `TEAM_ONLY` (só lead +
  CardMember veem). Os 4 níveis do Ummense são overkill pro uso interno
  — quem precisa ocultar quase sempre quer "só minha equipe vê".
- **Bypass por Org**: OWNER/ADMIN/GESTOR sempre veem todos os cards
  (mesmo bypass de board listing).
- **Helper centralizado**: `cardWhereForUser(userId, orgRole)` em
  `common/util/card-privacy.ts` retorna fragment Prisma reutilizável.
- **Aplicado em endpoints críticos**:
  - `boards.getOne` (lists.cards no board view)
  - `cards.findById` (modal individual)
  - `search.search` (busca global)
  - `me/recent-cards`, `me/tasks` (home)
- **Não aplicado em V1**: admin endpoints, importer, indicadores
  agregados (estes só GESTOR+ acessa, então já bypass).
- **Activity log**: `CARD_UPDATED` com payload `{ kind: 'privacy_changed' }`
  no PATCH.

V2 (backlog) revisita se precisar dos 4 níveis Ummense.
