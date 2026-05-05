# 36 — Favoritos de fluxo (por usuário)

## Contexto

Hoje `/quadros` lista todos os boards visíveis ao usuário, ordenados por
`updatedAt desc`. Em uma Org com 20+ fluxos isso polui — cada usuário
trabalha rotineiramente em 2-4 fluxos e o resto é "dele só de vez em
quando".

User pediu favoritar/desfavoritar próprio fluxo, com sub-divisão na
página: favoritados em cima (alfabético), todos embaixo (alfabético).
Padrão Notion/Linear/GitHub.

## Decisões

- **Por usuário**: cada user tem sua lista de favoritos (não compartilhada).
- **Modelo**: tabela `BoardFavorite (userId, boardId, favoritedAt)` PK
  composta. Cascade no User e Board.
- **Listagem**: endpoint existente `GET /v1/boards` passa a retornar
  `isFavorite: boolean` no item. Frontend filtra/ordena.
- **Ordenação**: alfabética (não por `favoritedAt`) — mais previsível
  pra encontrar.
- **Persistência da preferência**: nada extra. Order = `name ASC` em
  ambos os grupos.
- **Toggle**: `POST /v1/boards/:id/favorite` (idempotente: cria se não
  existe) e `DELETE /v1/boards/:id/favorite` (idempotente).

## Etapas

1. Migration `BoardFavorite` (composite PK userId+boardId).
2. Schema Prisma: `model BoardFavorite` + relations no User e Board.
3. Service: `listForUser` carrega favoritos do user e injeta `isFavorite`.
4. Service: `favoriteBoard(userId, boardId)` upsert; `unfavorite` delete.
5. Controller: 2 endpoints novos (POST/DELETE).
6. Frontend: tipo `BoardListItem.isFavorite`, query `favoriteBoard`/`unfavorite`.
7. Frontend `/quadros`: separa em 2 seções "Favoritos" (se houver) +
   "Todos os fluxos". Botão estrela em cada card pra toggle.
8. Otimismo: toggle atualiza estado local antes do round-trip.

## Critérios de aceite

- [ ] Estrela vazia/preenchida no card de cada fluxo em `/quadros`.
- [ ] Click toggla; persiste após reload.
- [ ] Página exibe seção "Favoritos" no topo só se houver pelo menos 1.
- [ ] Dentro de cada seção, ordem alfabética por nome.
- [ ] Favoritar é por usuário — outros membros não veem favoritos alheios.

## Riscos

- **Estados de visibilidade**: se user perde acesso a um board (foi
  removido), `BoardFavorite` ainda fica no DB. Não aparece pra ele
  porque `listForUser` filtra por visibilidade. Limpa via cascade
  só quando o board ou o user é deletado. Aceitável.
