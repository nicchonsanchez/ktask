# 13 — Cards em múltiplos fluxos (presença M:N com Board)

> **Status**: iteração 1 entregue (aditivo). Tabela `CardPresence` criada e
> backfilled, endpoints de listar/vincular/desvincular funcionais, aba
> "Fluxos" no modal lê do endpoint real e permite vincular o card a outro
> fluxo. **Iteração 2** (kanban lendo de CardPresence + move/complete por
> fluxo) e **iteração 3** (remoção dos campos legacy do Card) ficam pra
> próximas sessões.

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

## Iteração 2 (próxima)

- [ ] `PATCH /cards/:id/flows/:boardId/move` — mover por fluxo
- [ ] Kanban lê de `CardPresence` (passa a renderizar cards vinculados nos
      fluxos não-primários)
- [ ] Move otimista no kanban atualiza `CardPresence` ao invés de `Card.*`
- [ ] Finalizar card: por padrão finaliza só no fluxo onde a ação rolou,
      não em todos
- [ ] Coluna virtual "Finalizado" filtra por presence

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
