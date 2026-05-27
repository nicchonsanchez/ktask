# Visão Gerencial — modo Kanban (colunas virtuais cross-fluxo)

> Status: **DECISÕES FECHADAS (2026-05) — pronto pra implementar Fase 1.**

## Decisões travadas

- **D1 = read-only.** Kanban é só visualização; clicar abre o modal do card
  (mexe no board real). Sem drag-drop. (Cor própria por-Kanban: adiada pra
  Fase 2 — tabela isolada `ManagementCardColor`, não toca o cardColor real.)
- **D2 = compartilhada** (org). Gestão configura, todos os gestores veem.
- **D3 = modelar pra N visões, expor 1 na UI do v1.** Seletor de visões fica
  pra quando precisar (sem migration nova).
- **D4 = card aparece em todas as colunas onde casa**, com **selo indicador**
  ("também em: X") pra explicar a repetição.
- **D5 = relacional** (tabelas com FK pras listas; cascade limpa fontes
  órfãs).

## Conceito

A Visão Gerencial hoje é **lista paginada** que agrega cards de todos os
boards acessíveis (só roles OWNER/ADMIN/GESTOR). Queremos adicionar um
**modo Kanban** que NÃO espelha um board real — é uma visão montada à mão
onde cada coluna é **virtual** e agrega cards de várias listas de vários
quadros diferentes.

Exemplo do Lucas:

| Coluna virtual | Fontes (board → lista)                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------ |
| A fazer        | Tecnologia→A fazer, Tecnologia→Backlog, RedesSociais→Backlog, Design→Backlog                     |
| Fazendo        | Tecnologia→Fazendo, RedesSociais→Produção, RedesSociais→Copy, RedesSociais→Design, Design→Design |
| Aprovação      | RedesSociais→Aprovação, Design→🚩 Aprovação, ANEC→🚩 APROVAÇÃO                                   |
| Concluídos     | Tecnologia→Finalizado, RedesSociais→Finalizado, Design→Finalizado, X→Prontos                     |

O Lucas cria as colunas e, em cada uma, escolhe N pares (quadro, lista).
O Kanban exibe os cards reais dessas listas agrupados pela coluna virtual.

## Por que é "pesada"

1. **Modelo de dados novo**: precisa persistir a config (colunas + fontes).
2. **Agregação cross-board** com permissão + privacidade respeitadas.
3. **Multi-fluxo**: um card pode ter presença em 2 listas-fonte mapeadas
   pra colunas virtuais diferentes → precisa regra de desempate.
4. **Drag-drop é ambíguo**: arrastar de "A fazer" pra "Fazendo" significa
   mover o card no board REAL dele — mas a coluna destino mapeia N listas
   de N boards. Pra qual lista vai? (decisão aberta).

---

## Decisões ABERTAS (precisa fechar com o Nicchon antes de codar)

### D1. Drag-drop ou read-only no v1?

- **(a) Read-only** (recomendado v1): Kanban é só visualização. Clicar no
  card abre o modal (já temos). Mover = entrar no card e mexer no board
  real. Simples, sem ambiguidade, entrega valor rápido.
- **(b) Drag-drop com regra**: cada coluna virtual define, por board, qual
  é a "lista alvo" pra onde o card vai quando solto ali. Ex: soltar em
  "Fazendo" um card do board Tecnologia → vai pra Tecnologia→Fazendo.
  Mais poderoso, bem mais complexo (precisa mapear alvo de move por board,
  e cards de boards sem alvo definido na coluna não podem ser soltos).

**Recomendo (a) no v1, (b) como v2** se houver demanda.

### D2. Config compartilhada (org) ou por usuário?

- **(a) Compartilhada** (recomendado): a gestão (OWNER/ADMIN/GESTOR) cria
  e edita; todos os gestores veem a mesma. Simples, é "a visão da agência".
- **(b) Por usuário**: cada gestor monta a sua. Mais flexível, mais dados,
  e some quando a pessoa sai.

**Recomendo (a)**, com possibilidade de **múltiplas visões salvas**
(ex: "Operação geral", "Só clientes externos") — ver D3.

### D3. Uma visão ou várias salvas?

- v1: **uma visão Kanban por org** (mais simples).
- Futuro: várias visões nomeadas, com seletor no topo.
- Decisão: começar com 1, modelar já pensando em N (tabela permite vários).

### D4. Card que cai em 2 colunas (presença multi-fluxo)

Card X tem presença em Tecnologia→Fazendo (mapeada em "Fazendo") E em
RedesSociais→Backlog (mapeada em "A fazer"). Aparece em qual?

- **(a) Nas duas** (duplicado visualmente) — reflete a realidade multi-fluxo
  mas confunde ("por que esse card tá em 2 lugares?").
- **(b) Só na primeira por ordem de prioridade** das colunas (esq→dir) —
  card aparece 1x, na coluna mais "à direita"/"esquerda" conforme regra.
- **(c) Dedup pela presença primária** (Card.boardId) — só conta a fonte
  que bate com o board primário do card.

**Recomendo (a)** com um selo discreto "+N fluxos" no card pra explicar,
OU **(b)** priorizando a coluna mais à direita (estágio mais avançado).
Decisão de produto — depende de como o Lucas pensa o fluxo.

### D5. Storage: relacional ou JSON?

- **(a) Relacional** (recomendado): tabelas próprias, FK pras listas reais.
  Integridade: se uma lista é arquivada/deletada, a fonte some/limpa via
  cascade. Queryável.
- **(b) JSON** numa coluna: `columns: [{ name, sources: [{boardId, listId}] }]`.
  Simples de salvar, mas sem integridade referencial — lista deletada vira
  fonte fantasma; precisa limpar na mão.

**Recomendo (a) relacional.**

---

## Proposta técnica (assumindo D1=a, D2=a, D3=1-modelando-N, D4=a, D5=relacional)

### Modelo de dados (Prisma)

```prisma
model ManagementBoard {
  id             String   @id @default(cuid())
  organizationId String
  name           String   @default("Visão Kanban")
  position       Float    @default(0)  // pra futuro multi-visão
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization              @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  columns      ManagementColumn[]

  @@index([organizationId])
}

model ManagementColumn {
  id                String   @id @default(cuid())
  managementBoardId String
  name              String   // "A fazer", "Fazendo", etc.
  position          Float
  createdAt         DateTime @default(now())

  board   ManagementBoard          @relation(fields: [managementBoardId], references: [id], onDelete: Cascade)
  sources ManagementColumnSource[]

  @@index([managementBoardId, position])
}

model ManagementColumnSource {
  id        String @id @default(cuid())
  columnId  String
  boardId   String
  listId    String

  column ManagementColumn @relation(fields: [columnId], references: [id], onDelete: Cascade)
  board  Board            @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list   List             @relation(fields: [listId], references: [id], onDelete: Cascade)

  @@unique([columnId, boardId, listId]) // nao duplica a mesma fonte na coluna
  @@index([columnId])
  @@index([listId])
}
```

Cascade resolve integridade: lista deletada → fonte some; board deletado →
fontes somem; org deletada → tudo some.

### Backend

- `GET /v1/management/kanban` → retorna a config (colunas + fontes) +
  os cards agrupados por coluna virtual.
  - assertManagementAccess (OWNER/ADMIN/GESTOR)
  - filtra fontes pra só listas de boards que o user acessa
    (listAccessibleBoardIds) — gestor não vê o que não pode
  - aplica cardVisibilityWhere (privacidade TEAM_ONLY)
  - reusa o cardSelect/shapeCardItem que a lista já usa
- CRUD da config:
  - `POST /v1/management/kanban/columns` (criar coluna)
  - `PATCH /v1/management/kanban/columns/:id` (renomear, reordenar)
  - `DELETE /v1/management/kanban/columns/:id`
  - `POST /v1/management/kanban/columns/:id/sources` (add fonte board+lista)
  - `DELETE .../sources/:sourceId`
- Agregação: por coluna, busca cards com CardPresence ativa em qualquer
  (boardId, listId) das fontes. Performance: 1 query com OR das fontes,
  agrupando no app por coluna. Cuidado com N alto (ok até centenas).

### Frontend

- Toggle **Lista | Kanban** no topo da Visão Gerencial (já tem o header).
- Modo Kanban:
  - Colunas horizontais com scroll, reusa `CardItem` (componente do board).
  - Botão "Configurar colunas" (engrenagem) abre dialog de config:
    - Lista de colunas (add/renomear/reordenar/remover)
    - Em cada coluna, lista de fontes com picker (board → lista)
  - Cards read-only (clique abre modal global `?card=`).
- Filtros existentes (usuário, período) aplicam por cima da agregação.

---

## Faseamento sugerido

- **Fase 1** (core): modelo + CRUD config + GET agregado + Kanban read-only
  - dialog de config + selo "também em" (D4). Entrega a feature inteira no
    modo visualização.
- **Fase 2** (opcional): cor própria por-Kanban (`ManagementCardColor`,
  isolada do cardColor real), múltiplas visões salvas (seletor D3).
  Drag-drop NÃO entra (decidido D1: não faz sentido mover aqui).

## Critérios de aceite (Fase 1)

- [ ] Gestão cria coluna virtual e adiciona fontes (board+lista)
- [ ] Kanban mostra cards reais agrupados nas colunas virtuais
- [ ] Respeita acesso a board + privacidade do card pro viewer
- [ ] Lista/board deletado não quebra (cascade limpa fonte)
- [ ] Toggle Lista ↔ Kanban preserva filtros
- [ ] Card multi-fluxo segue a regra escolhida em D4
- [ ] Só OWNER/ADMIN/GESTOR acessa e configura

## Riscos

- **Performance**: muitas fontes × muitos cards. Mitigar com índice em
  CardPresence(boardId, listId, removedAt) — provavelmente já existe.
- **Confusão de UX no multi-fluxo** (D4) — decidir bem.
- **Escopo Fase 1 já é grande**: modelo + 6 endpoints + Kanban + config
  dialog. ~2-3 dias. Drag-drop dobraria.
