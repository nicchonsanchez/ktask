# 30 — Drawer de fluxos arquivados + restauração

## Contexto

Hoje há dois caminhos diferentes pra "arquivar" um fluxo, com
comportamentos diferentes:

1. **Botão "Inativar"** em Configurações do fluxo → chama `archiveBoard()`
   → só seta `Board.isArchived = true`. Cards permanecem com
   `isArchived = false` (somem da listagem só porque o board sumiu).
2. **Botão "Excluir fluxo…" → opção "Arquivar fluxo"** (doc 29 V1) →
   chama `executeBoardDelete({strategy: 'archive-cascade'})` → arquiva
   board E cards exclusivos. Cards multi-fluxo continuam vivos.

Os dois caminhos persistem `BOARD_ARCHIVED` na Activity, mas só (2)
arquiva cards. Pra restaurar é necessário saber qual caminho foi usado.

Além disso, **não há UI alguma** pra listar/restaurar fluxos arquivados.
O endpoint `POST /v1/boards/:id/restore` existe e a função
`restoreBoard()` está em [boards.ts:130](../apps/web/src/lib/queries/boards.ts#L130),
mas nenhum componente chama. O texto do diálogo de configurações
inclusive promete uma "tela de Gestão de fluxos" que nunca foi feita.

## Escopo

### Dentro do escopo

1. **Endpoint `GET /v1/boards/archived`** — lista boards arquivados da
   Org com contagens (cards arquivados em cascata, listas, total cards).
   Filtra por permissão: só GESTOR/ADMIN/OWNER da Org veem (mesmo bypass
   que `ORG_ROLES_WITH_BOARD_BYPASS` aplica em `listForUser`).
2. **Drawer `<ArchivedBoardsDrawer>`** acionado por botão "Arquivados (N)"
   na página `/quadros`. Botão só aparece pra GESTOR+ e quando há ao
   menos um board arquivado.
3. **Restore ampliado**: `POST /v1/boards/:id/restore` passa a aceitar
   `{ restoreCascadedCards: boolean }` (default `true`). Quando `true`,
   busca a última Activity `BOARD_ARCHIVED` daquele board que tenha
   `payload.archivedCardIds` e desarquiva exatamente aqueles cards.
4. **Persistir IDs em cascata**: `executeDelete` na estratégia
   `archive-cascade` passa a salvar `archivedCardIds: string[]` no
   payload da Activity (hoje só salva o count). Crucial pro restore
   reverter exatamente o que foi arquivado em cascata, sem ressuscitar
   cards arquivados manualmente antes.
5. **Visibilidade**: drawer/endpoint independem de board visibility
   (PRIVATE também aparece pra GESTOR+). Justificativa: GESTOR já bypassa
   visibility no `listForUser`; arquivado segue mesma regra.

### Fora do escopo

- Lixeira / hard delete a partir do drawer (já temos no doc 29).
- Restaurar boards arquivados há "muito tempo" com cleanup automático
  (sem expiração por enquanto).
- Restaurar cards individuais de boards arquivados sem restaurar o
  board (drawer existente de cards arquivados dentro do board já cobre
  outro caso).

## Decisões tomadas

- **Permissão**: GESTOR/ADMIN/OWNER da Org (mesmo bypass de
  `ORG_ROLES_WITH_BOARD_BYPASS`). MEMBER/GUEST não veem o drawer.
- **Restore restaura cards em cascata**: default `true`. Justificativa:
  caso contrário usuário acha que perdeu cards. Flag `restoreCascadedCards`
  permite o caso raro de "quero o board de volta mas sem os cards".
- **Onde aparecem boards PRIVATE arquivados**: no drawer, pra GESTOR+
  (que já vê todos via bypass mesmo quando ativos).
- **Endpoint**: `GET /v1/boards/archived` (rota explícita, pediu o user).

## Etapas

1. Migration: nada novo. Activity já tem `payload Json`, basta gravar
   `archivedCardIds` ali. Preview JSONb do payload.
2. **Backend `executeDelete` (V1.1)**: na estratégia `archive-cascade`,
   coletar `exclusiveIds` (já feito) e gravar no payload da Activity
   junto com o count.
3. **Backend `GET /boards/archived`**: novo método em `BoardsService`
   - endpoint em controller. Retorna `{ id, name, color, icon, archivedAt,
cardsArchivedCount, totalCards, totalLists }`. Permissão: bypass
     ORG check; senão 403.
4. **Backend `restore` ampliado**: aceita body opcional
   `{ restoreCascadedCards?: boolean }`. Default true. Lê última
   Activity BOARD_ARCHIVED pro board, pega `payload.archivedCardIds`,
   `updateMany` setando `isArchived=false`. Activity nova
   `BOARD_RESTORED` com count.
5. **Frontend query**: `boardsArchivedQuery` retorna lista de
   `ArchivedBoardItem`.
6. **Frontend drawer**: novo componente `archived-boards-drawer.tsx`.
   Lista com cada board mostrando nome, cor, contagens, data, botão
   "Restaurar" e (opcional) "Excluir definitivamente" (link pro fluxo
   do doc 29 — abre o `DeleteBoardDialog` com `delete-all` pré-selecionado).
7. **Frontend integração `/quadros`**: botão "Arquivados (N)" no header
   (só visível pra GESTOR+ e quando N > 0). Abre o drawer. Botão usa
   ícone `Archive` da lucide.
8. **Frontend confirmação no restore**: ao clicar Restaurar, pergunta
   se quer restaurar os cards em cascata também (checkbox no dialog
   de confirmação). Default marcado.
9. **ActivityType**: adicionar `BOARD_RESTORED` no enum + migration.

## Critérios de aceite

- [ ] `GET /v1/boards/archived` retorna apenas boards arquivados, com
      contagens corretas, e devolve 403 pra MEMBER/GUEST.
- [ ] Após `archive-cascade`, payload da Activity contém
      `archivedCardIds` com os IDs corretos.
- [ ] `POST /v1/boards/:id/restore` (sem body) restaura board + cards
      cascateados (default true).
- [ ] `POST /v1/boards/:id/restore` com `{ restoreCascadedCards: false }`
      só desarquiva o board, deixa os cards arquivados.
- [ ] Botão "Arquivados (N)" aparece em `/quadros` só pra GESTOR+ e
      só quando N > 0.
- [ ] Drawer lista boards arquivados com data, contagens, botão
      restaurar funcional.
- [ ] Após restore via drawer, board reaparece em `/quadros` e cards
      cascateados voltam às listas originais.
- [ ] Activity `BOARD_RESTORED` é registrada com count de cards
      restaurados.

## Riscos / decisões abertas

- **Cards arquivados manualmente antes do `archive-cascade`**: NÃO
  devem ser restaurados pelo restore default. Por isso a leitura do
  `payload.archivedCardIds` é crítica — não usar
  `Card.boardId = X AND isArchived = true` como filtro genérico.
- **Múltiplas archives consecutivas**: se o usuário arquivar, restaurar
  e arquivar de novo, há 2 Activities BOARD_ARCHIVED. Restore deve usar
  a **mais recente** (orderBy createdAt desc + take 1).
- **Boards arquivados antigos (pré V1.1)**: não têm `archivedCardIds`
  no payload. Restore desses boards só restaura o board (sem cascata).
  Aceitável — eram do caminho legado que não arquivava cards.
- **Concorrência**: GESTOR A arquiva, GESTOR B tenta arquivar
  novamente (ja arquivado). Endpoint deve ser idempotente — checar
  `isArchived` antes.

## Relação com outros docs

- **29-exclusao-de-fluxo.md**: complemento. Doc 29 cuida da saída,
  doc 30 cuida da volta. V1.1 do doc 29 (persistir `archivedCardIds`)
  é pré-requisito do restore-com-cascata.
- **13-cards-multi-fluxo.md**: pré-requisito conceitual (CardPresence
  define exclusividade vs multi-fluxo).
