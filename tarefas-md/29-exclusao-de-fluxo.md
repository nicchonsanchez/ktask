# 29 — Exclusão de fluxo (board) com opções de cascata

## Status

- **V1 entregue:** preview + duas estratégias seguras (`archive-cascade`,
  `delete-all`). Endpoint, dialog UI e migration `BOARD_DELETED`. Validado
  com typecheck e lint.
- **V2 (backlog):** estratégias `move`, `unlink`, `delete-orphans`. Exigem
  reassignment de `Card.boardId` (NOT NULL no schema atual) e merecem
  pass dedicado com testes — separadas por isso.

## Contexto

Hoje o sistema só tem **archive** (soft delete via `isArchived: true`,
[boards.service.ts:358](../apps/api/src/modules/boards/boards.service.ts#L358)).
Não existe fluxo de exclusão definitiva nem opções pro que fazer com
os cards que estavam dentro do board.

Ummense tem isso bem resolvido: ao tentar excluir um fluxo, abre um
diálogo perguntando o que fazer com os cards (deletar / desvincular /
mover pra outro fluxo / deletar só os exclusivos). Vamos replicar.

## Escopo

### Dentro do escopo

1. Endpoint **DELETE `/v1/boards/:boardId`** (hard delete) com payload
   indicando estratégia de cascata pros cards.
2. Estratégias suportadas:
   - `archive-cascade` — arquiva todos os cards do board (não deleta).
     Mantém `CardPresence` pra histórico, só seta `card.isArchived = true`
     pra cards que estavam **só** neste board.
   - `delete-all` — deleta cascata: cards (mesmo se aparecem em outros
     boards), `CardPresence`, atividades vinculadas, etc.
   - `delete-orphans` — deleta apenas cards cuja única `CardPresence`
     era neste board. Cards multi-fluxo perdem só a presença deste
     board (continuam existindo nos outros).
   - `unlink` — não deleta nenhum card, só remove a `CardPresence`
     deste board. Cards que ficavam só nele viram "órfãos" (sem board)
     e devem aparecer em alguma view de "cards sem fluxo" pro user
     decidir depois.
   - `move` — move todos os `CardPresence` deste board pra outro board
     destino (`targetBoardId` no payload). Cards que já têm presença
     no destino só perdem a presença daqui (não duplica). Lista do
     board de origem mapeia pra lista do destino: usa fuzzy match igual
     ao importer + fallback configurável (criar novas listas no destino
     ou jogar tudo pra primeira lista).
3. Diálogo no frontend (em `board-settings-dialog.tsx` ou novo) com
   radio das 5 opções, contagem por estratégia ("3 cards são exclusivos
   deste fluxo, 12 estão em outros") e confirmação digitando o nome do
   board (igual GitHub).
4. Activity log: `BOARD_DELETED` com payload incluindo estratégia +
   contagens finais (quantos cards deletados, desvinculados, movidos).
5. Permissão: só `OWNER` da Org ou `ADMIN` do board pode executar.
   Owner sempre tem prioridade.

### Fora do escopo

- Lixeira / undo de board deletado. Hard delete é definitivo.
- Restaurar `CardPresence` removido por `unlink`.
- Backup automático antes de deletar (a infra geral de backup já cobre).

## Decisões / questões abertas

- **Default da UI:** `archive-cascade` é o mais seguro, deve ser o
  pré-selecionado. `delete-all` exige confirmação extra (texto livre).
- **`unlink` cria órfãos** — precisamos de uma view "Cards sem fluxo"
  na home ou em `/empresa` pro user reaproveitar. Sem essa view,
  desligar a opção `unlink` da UI até existir.
- **`move` + lista do destino:** se o board destino não tem listas
  equivalentes, criar listas com o nome original ou cair na primeira
  lista? Pré-selecionar "criar listas equivalentes" (espelha o que
  o importer V2 faz).
- **CardPresence vs Card:** modelo atual permite que um card exista
  sem nenhuma presença? Verificar schema. Se não permite, `unlink`
  precisa virar `archive` automaticamente pros cards que ficariam
  sem nenhum board.

## Etapas

1. Schema/modelo: verificar invariantes de `CardPresence` (card pode
   ficar sem nenhuma presença? cardinalidade?). Doc no PR.
2. Endpoint **GET `/v1/boards/:boardId/delete-preview`** — devolve
   contagem por estratégia (`exclusiveCards`, `multiFlowCards`,
   `totalLists`, `totalActivities`). Sem mutation.
3. Endpoint **DELETE `/v1/boards/:boardId`** com `body.strategy` (zod
   discriminated union) + `body.targetBoardId` quando `move`.
4. Service: implementar as 5 estratégias dentro de transação Prisma.
   Validar invariantes (ex: `move` exige board destino válido na
   mesma Org).
5. UI: `delete-board-dialog.tsx` com preview (chama o endpoint do
   passo 2 ao abrir), radio das estratégias, contagens, confirmação
   por texto livre pro `delete-all`.
6. Adicionar entrada no menu do board (`board-header.tsx` ou
   `board-settings-dialog.tsx`) — só visível pra OWNER/ADMIN.
7. Activity log + invalidação de queries (`boards.all`, `me.recent-cards`).

## Critérios de aceite

- [ ] DELETE `/v1/boards/:boardId` com `strategy: 'archive-cascade'`
      arquiva o board e os cards exclusivos. Multi-fluxo permanecem.
- [ ] `strategy: 'delete-all'` deleta board + todos os cards do board
      (mesmo multi-fluxo) + `CardPresence` + listas. Atividades dos
      cards apagados também vão.
- [ ] `strategy: 'delete-orphans'` deleta só cards exclusivos. Cards
      multi-fluxo perdem apenas a `CardPresence` do board deletado.
- [ ] `strategy: 'unlink'` não deleta nenhum card; só remove
      `CardPresence`. Cards exclusivos viram órfãos (ou viram
      arquivados se schema não permitir orfão — doc final do schema).
- [ ] `strategy: 'move'` + `targetBoardId` cria/reutiliza listas no
      destino, move presenças, sem duplicar.
- [ ] Preview retorna contagens corretas pras 5 estratégias antes
      de executar.
- [ ] Dialog UI mostra preview, exige confirmação por texto livre pro
      `delete-all`, e respeita permissão (OWNER/ADMIN do board).
- [ ] Activity `BOARD_DELETED` registrada com payload completo.
- [ ] Reimport do CSV após `delete-all` recria os cards (validação
      de que não sobrou índice unique de `shortCode` órfão).

## Riscos / decisões

- **Hard delete é destrutivo.** Confirmação dupla obrigatória pro
  `delete-all`. Logar tudo no Activity pra forense.
- **Performance:** boards com >1000 cards podem timeout. Avaliar
  job assíncrono (BullMQ) com toast de "exclusão em andamento" se
  passar de N cards.
- **Multi-fluxo (doc 13):** essa feature só faz sentido com cards
  multi-fluxo já implementados. Confirmar status antes de começar.

## Relação com outros docs

- **13-cards-multi-fluxo.md** — pré-requisito conceitual; a estratégia
  `delete-orphans` e `unlink` só existem porque cards podem estar em
  múltiplos boards.
- **16/28-importer-ummense.md** — bug correlato: ao re-importar CSV,
  cards com `shortCode` já existente são pulados em vez de adicionados
  ao novo board. Fix relacionado mas separado: o importer deveria
  detectar shortCode existente e **adicionar `CardPresence`** no novo
  board em vez de pular. Tratar em doc/PR próprio.
