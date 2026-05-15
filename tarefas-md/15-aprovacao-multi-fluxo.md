# Aprovação multi-fluxo: "Mover pra X" por board onde o card está

> Hoje a aprovação só consegue mover o card no board principal. Pra cards multi-fluxo (presentes em N boards), a decisão de aprovação deve permitir configurar destino independente por board.

## Escopo

### Dentro

- Schema: substituir `defaultOnApproveListId` / `defaultOnRejectListId` (1 lista) por `defaultOnApproveTargets` / `defaultOnRejectTargets` (array de `{boardId, listId}`).
- Backward compat: legacy continua suportado pra pedidos antigos.
- Backend `applyDecision`: iterar nos targets, atualizar `CardPresence` daquele board (não mais `Card.listId` legacy).
- `sideEffects` vira map `{[boardId]: {from, to}}` pra suportar undo multi-board.
- Frontend dialog: 1 bloco por board onde o card está presente, cada um com 2 selects (aprovar / reprovar). Default todos como "(não mover)".
- Endpoint `GET /cards/:id/flows` já existe — reusar pra popular o dialog.

### Fora

- Movimentação automática para boards onde o card **não** está presente (não faz sentido).
- "Adicionar etiqueta" também ser configurado por board. Por ora, tags continuam globais (afetam o card todo, independente de board). Se aparecer demanda, abrir tarefa separada.
- Quorum (vários revisores precisam aprovar). Continua "primeiro a votar ganha".

## Etapas

### 1. Schema Prisma

`apps/api/prisma/schema.prisma`, modelo `CardApproval`:

- Adicionar `defaultOnApproveTargets Json?` (shape: `Array<{boardId: string, listId: string}>`).
- Adicionar `defaultOnRejectTargets Json?` (idem).
- Manter `defaultOnApproveListId` / `defaultOnRejectListId` com comentário `@deprecated — usar defaultOnApproveTargets/defaultOnRejectTargets`.

### 2. Migration

`pnpm prisma migrate dev --name approval_multi_flow_targets`.

### 3. DTOs Zod

`apps/api/src/modules/approvals/dto/approvals.schemas.ts`:

```ts
const ApprovalTargetSchema = z.object({
  boardId: z.string().cuid(),
  listId: z.string().cuid(),
});

// No RequestApprovalSchema:
defaultOnApproveTargets: z.array(ApprovalTargetSchema).max(20).optional(),
defaultOnRejectTargets: z.array(ApprovalTargetSchema).max(20).optional(),
// Mantém os legacy como optional pra compat com clientes antigos.
defaultOnApproveListId: z.string().min(1).optional(),
defaultOnRejectListId: z.string().min(1).optional(),
```

### 4. Backend `request()`

`apps/api/src/modules/approvals/approvals.service.ts`:

- Validar cada `ApprovalTarget`: lista existe + pertence ao board do target + board está nos `flows` do card (CardPresence ativa).
- Se vier o legacy `defaultOnApproveListId` (sem `defaultOnApproveTargets`), converter pra `[{boardId: card.boardId, listId: legacyId}]` na hora de gravar.

### 5. Backend `applyDecision()`

Refatorar pra iterar nos targets:

```ts
const targets = (
  newStatus === 'APPROVED' ? a.defaultOnApproveTargets : a.defaultOnRejectTargets
) as Array<{ boardId; listId }> | null;

const moves: Array<{ boardId; from; to }> = [];

for (const target of targets ?? []) {
  // 1. Buscar CardPresence atual nesse board
  const presence = await tx.cardPresence.findUnique({
    where: { cardId_boardId: { cardId: a.cardId, boardId: target.boardId } },
  });
  if (!presence) continue; // card não tá mais presente nesse board
  if (presence.listId === target.listId) continue; // já está lá

  // 2. Validar que lista existe + não arquivada + pertence ao board
  const list = await tx.list.findUnique({ where: { id: target.listId } });
  if (!list || list.boardId !== target.boardId || list.isArchived) continue;

  // 3. Mover via update do CardPresence (não mais Card.listId legacy)
  const last = await tx.cardPresence.findFirst({
    where: { listId: target.listId, removedAt: null },
    orderBy: { position: 'desc' },
  });
  await tx.cardPresence.update({
    where: { cardId_boardId: { cardId: a.cardId, boardId: target.boardId } },
    data: {
      listId: target.listId,
      position: (last?.position ?? 0) + 1,
    },
  });
  moves.push({ boardId: target.boardId, from: presence.listId, to: target.listId });
}

// sideEffects shape novo
sideEffects.moves = moves;
```

Edge case: se `presence` é "primary" (sincronizada com `Card.listId` legacy), atualizar `Card.listId` também pra manter o invariante.

### 6. Backend `undo()`

Reverter cada `move` em `sideEffects.moves` (versão multi).

### 7. Frontend queries

Estender `RequestApprovalInput`:

```ts
export interface RequestApprovalInput {
  // ...
  defaultOnApproveTargets?: Array<{ boardId: string; listId: string }>;
  defaultOnRejectTargets?: Array<{ boardId: string; listId: string }>;
  /** @deprecated usar defaultOnApproveTargets */
  defaultOnApproveListId?: string;
  /** @deprecated usar defaultOnRejectTargets */
  defaultOnRejectListId?: string;
}
```

### 8. Frontend `request-approval-dialog.tsx`

- Query `cardsQueries.flows(cardId)` em paralelo com `boardsQueries.detail(boardId)`.
- Renderizar 1 bloco por flow:
  ```
  ┌──────────────────────────────────────┐
  │ Cliente Alfa — Redes Sociais         │
  │   Mover pra: [(não mover) ▼]         │
  └──────────────────────────────────────┘
  ```
- Mantém um state `Record<boardId, { approveListId, rejectListId }>`.
- Default todos como `''` (não mover).
- Se `flows.length === 1` mostra UI atual (sem o subtítulo do board, pra não poluir).
- No submit, monta `defaultOnApproveTargets` filtrando entradas vazias.

### 9. Activity log

Atualizar payload de `approval.approved` / `approval.rejected` pra incluir `moves: Array<{boardId, fromListId, toListId}>` em vez do legado.

### 10. Tutorial

`apps/web/content/ajuda/aprovacoes/01-pedir-aprovacao-cliente.md`: adicionar seção "Card em múltiplos fluxos" explicando o comportamento.

## Critérios de aceite

- [ ] Migration roda sem erro.
- [ ] Card em 1 board: dialog parece igual ao atual (1 bloco). Submit grava nos targets.
- [ ] Card em 2+ boards: dialog mostra N blocos. Posso escolher diferente em cada. Submit envia array.
- [ ] Decisão APROVE move só nas presences configuradas. As outras ficam onde estavam.
- [ ] Undo reverte cada move independente.
- [ ] Pedido antigo (criado antes da migration, com `defaultOnApproveListId` setado): continua funcionando — converte na decisão.
- [ ] Pedido novo com `defaultOnApproveTargets = []`: aprovação não move nada (mesmo comportamento de "não mover").
- [ ] Typecheck + lint verdes.

## Riscos / decisões

- **Conversão legacy → novo**: feita na hora da decisão (não na migration), pra evitar regravar dados antigos.
- **Card "removido" de um board** entre o pedido e a decisão: `CardPresence` com `removedAt != null`. O move é skipped (não falha).
- **Lista alvo arquivada** entre pedido e decisão: skipped silenciosamente. Decisão continua válida (status muda), só não move.
- **`Card.listId` legacy**: ainda atualizado quando o move acontece no board "primary" do card. Outras partes do código (timeline, cards.service) ainda leem `Card.listId` por compat — manter sincronizado.
- **Tamanho máximo de targets**: 20. Card em 20 boards é extremo mas tecnicamente possível. Limite via Zod.

## Follow-ups

- "Mover pra X" + "Adicionar tag Y" por board (hoje tags são globais). Apareceu demanda → abrir tarefa.
- Templates de "Mover pra X ao aprovar" reutilizáveis (saved presets). Hoje cada pedido configura do zero.
