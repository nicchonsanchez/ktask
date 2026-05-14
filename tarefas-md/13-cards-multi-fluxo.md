# 13 — Cards em múltiplos fluxos (presença M:N com Board)

> **Status**: iterações 1 e 2 entregues. Cards agora aparecem no kanban de
> qualquer fluxo onde estão vinculados, e mover por fluxo na aba "Fluxos"
> afeta só aquele fluxo. **Iteração 3** (remoção dos campos legacy do Card)
> fica pra próxima sessão — hoje Card.boardId/listId/position/completedAt
> ainda existem como espelho do fluxo primário.

## Iteração 1 (entregue)

- [x] `CardPresence` (cardId+boardId composto, listId+position+completedAt
      por fluxo, soft-delete via `removedAt`)
- [x] Backfill: 1 presença por card existente espelhando o estado atual
- [x] `Card.create` cria a presence primária junto
- [x] `Card.move/complete/uncomplete` espelham na presence primária pra
      manter consistência (ainda fonte de verdade nos campos legacy)
- [x] `GET /cards/:id/flows` — lista presenças ativas + dados do board (com
      filtro de acesso por presença)
- [x] `POST /cards/:id/flows` — vincula a outro fluxo (cria/reativa
      `CardPresence`)
- [x] `DELETE /cards/:id/flows/:boardId` — soft-delete (não permite no
      primário)
- [x] Aba "Fluxos" do modal lê o endpoint, mostra todas as presences,
      permite vincular/desvincular e move só no fluxo primário (legacy)

## Iteração 2 (entregue)

- [x] `PATCH /cards/:id/flows/:boardId/move` — mover por fluxo
- [x] Kanban (`boards.getOne`) lê de `CardPresence` (cards vinculados aparecem
      em todos os fluxos onde têm presença ativa)
- [x] Aba "Fluxos" no modal usa `moveCardInFlow` em todos os fluxos (não só o primário)
- [x] Coluna virtual "Finalizado" (`listCompleted` + `completedCount`) usa
      presence (cada fluxo tem contagem própria)
- [ ] Move otimista no kanban via dnd ainda chama `cards/move` legacy
      (espelha automaticamente, mas sem semântica per-flow ainda)
- [ ] Finalizar card via dnd na coluna "Finalizado" do kanban: hoje
      finaliza Card.completedAt (espelha primário). Per-flow complete fica
      pra um follow-up separado

## Iteração 3 (cleanup)

- [ ] Remove `Card.boardId/listId/position/completedAt/completedById`
- [ ] Adiciona `Card.primaryBoardId` pra determinismo de criação
- [ ] Migration data (campos legacy → CardPresence; já backfilled, só remove)

---

> Doc original (mantido pra contexto histórico):

## Motivação

No Ummense um card pode viver em vários fluxos simultaneamente. Cada fluxo guarda a **coluna atual** e o **status de finalização independente**. Exemplo real:

- Card "ANEC | NOVO PORTAL" está em 2 fluxos:
  - `ANEC` → coluna `APROVAÇÃO`
  - `Tecnologia` → coluna `Aguardando retorno de terceiros`

Cenários típicos onde isso aparece:

- Uma demanda envolve mais de um setor (Tecnologia + Comercial + Design); cada setor acompanha no próprio fluxo mas é o mesmo card (mesmos comentários, anexos, líder, histórico).
- A "Finalização" acontece em tempos diferentes em cada fluxo — Tecnologia entrega antes de Comercial fechar.

## Modelo de dados proposto

Hoje o `Card` tem:

```
Card { id, boardId, listId, position, completedAt, completedById, ... }
```

`boardId` e `listId` são 1:1 com o card. Precisam sair pra uma tabela intermediária:

```
CardPresence {
  cardId           String
  boardId          String
  listId           String
  position         Float
  completedAt      DateTime?
  completedById    String?
  addedAt          DateTime  @default(now())
  removedAt        DateTime? // soft "desvincular"

  @@id([cardId, boardId])
  @@index([boardId, listId, position])
  @@index([boardId, completedAt])
}
```

Mudanças em `Card`:

- Remover `boardId`, `listId`, `position`, `completedAt`, `completedById`
- Ganha `primaryBoardId` (só pra saber de onde o card "nasceu" — útil pra permissão inicial)

Mudanças em `Activity`:

- `boardId` atual já existe e fica. Quando uma ação acontece via um fluxo específico, a activity vai pra `boardId` daquela presença. No feed do card (unificado), agregamos todas.

Permissão:

- Acesso ao card = união de acessos a qualquer um dos `boards` onde ele tem presença. Uma pessoa sem acesso ao fluxo "Comercial" não vê atividades desse fluxo na timeline.

## UX de referência (Ummense)

> Placeholder visual da aba já existe em `apps/web/src/components/board/card-flows-tab.tsx`,
> renderizando 1 só fluxo (o atual) com botões disabled. Vai virar funcional quando
> a tabela `CardPresence` chegar.

**Aba "Fluxos" dentro do modal do card:**

- Lista vertical dos fluxos onde o card tem presença ativa
- Cada fluxo como barra horizontal compacta:
  - Header: emoji do fluxo + nome + avatares dos membros do fluxo + cadeado se privado
  - Linha de cores:
    - Ícone de relógio (histórico daquele fluxo) — ao clicar abre timeline filtrada por esse fluxo
    - Todas as listas em sequência (cada coluna como retângulo igualmente largo)
    - Coluna atual: bg roxo destaque, demais: bg cinza claro
    - Ícone de check ✓ no fim = "Finalizar nesse fluxo" (não é coluna, é terminal)
  - Drag handle vertical (6 pontos) à esquerda da linha pra reordenar fluxos
  - Menu `...` por fluxo: "Visualizar fluxo" (abre o board), "Desvincular card deste fluxo"
- Botão "**Vincular a outro fluxo**" → abre dropdown com busca de fluxos
  - Ao escolher, abre seleção de coluna inicial
  - Cria nova `CardPresence` no banco
- Toggle "**Exibir fluxos inativados**" → mostra presenças com `removedAt != null`
- Card de lembrete embaixo: explica que cada fluxo tem ciclo independente

**Coluna Finalizado no Kanban:**

- Barra estreita no fim do board (não coluna cheia)
- Ícone check + contagem; click abre drawer
- Drop = finalizar **nesse fluxo apenas** (não afeta outras presenças)

## Impactos em features já existentes

- **Move entre listas**: hoje muta `Card.listId`. Vai mutar `CardPresence.listId` onde `boardId = X`
- **Finalizar**: muta `CardPresence.completedAt`, não `Card.completedAt`
- **Coluna virtual Finalizado**: conta por board, filtra por board (já está assim, só troca a fonte)
- **Activity log**: já tem `boardId`. Cada ação pertence a um fluxo específico
- **Realtime**: eventos `card.*` são emitidos pra `board:{id}` do fluxo onde a ação aconteceu. Usuários de outros fluxos não recebem — comportamento desejado
- **Comentários**: ficam no Card (não na presença). Um comentário aparece em todos os fluxos
- **Busca**: um card bate se qualquer `CardPresence` bater no filtro
- **Automações (Fase 2)**: actions tipo "mover card pra lista X" precisam especificar em qual fluxo

## Migration plan (quando chegar a hora)

1. Criar tabela `CardPresence` vazia
2. Popular com `INSERT INTO CardPresence SELECT id, boardId, listId, position, completedAt, completedById, createdAt, null FROM Card`
3. Adicionar `primaryBoardId` em Card (= boardId atual)
4. Code shim: queries que leem `card.listId` passam a ler `cardPresence.listId WHERE boardId = ctx.boardId`
5. Deploy do shim (ainda com colunas velhas)
6. Deploy que remove colunas velhas do Card + índices redundantes
7. Backfill migration

Cuidado especial: **move entre fluxos** — precisa semântica nova ("desvincula de A e vincula em B" vs "vincula em B mantendo em A"). UX: drag entre boards diferentes **copia a presença**, clique em "mover" no menu **transfere** (remove + adiciona).

## Itens relacionados (não entram aqui, só ficam anotados)

- **Card filho / hierarquia**: ortogonal. Schema já tem `Card.parentCardId`. UX "Família" no Ummense.
- **"Contatos"**: entidade própria deles (CRM-like). Mapeamos pra `CardMember` por enquanto.
- **Campos personalizados**: parkados, entram na Fase 2.

## Invariante crítica: como criar Card corretamente

Adicionado em 2026-05-13 após postmortem [CARROSSEL CANNES](../docs/postmortems/2026-05-13-carrossel-cannes.md) — 9 cards ficaram "invisíveis no kanban" por 17 dias porque 3 métodos de criação esqueceram parte da sequência obrigatória.

**Toda criação de Card precisa executar 3 passos juntos, em transação:**

1. `Organization.cardSequence` increment atômico → gera `shortCode` único por Org.
2. INSERT em `Card` com o `shortCode` gerado.
3. INSERT em `CardPresence` com `(cardId, boardId, listId, position)`. **Sem essa row o card existe no banco mas não aparece no kanban** — o `GET /boards/:id` consulta `CardPresence`, não `Card.boardId`.

**Como fazer certo:**

Use o helper canônico em [apps/api/src/modules/cards/helpers/create-card-with-presence.ts](../apps/api/src/modules/cards/helpers/create-card-with-presence.ts):

```typescript
import { createCardWithPresence } from '@/modules/cards/helpers/create-card-with-presence';

const card = await createCardWithPresence(tx, {
  organizationId,
  boardId,
  listId,
  title,
  position,
  createdById: userId,
  // ... outros campos opcionais
});
```

O helper executa os 3 passos em ordem. O JSDoc do arquivo aponta pra este doc e pro postmortem.

**Quando NÃO usar o helper:**

- Importer (`apps/api/src/modules/importer/`) usa criação manual porque aloca shortCodes em batch — exceção documentada.
- Qualquer outro caso novo: usar o helper. Se algum requisito não encaixar, abrir nova ADR antes de duplicar a sequência.

**Decisão arquitetural:** [docs/adr/0006-helper-centralizado-criacao-card.md](../docs/adr/0006-helper-centralizado-criacao-card.md).
