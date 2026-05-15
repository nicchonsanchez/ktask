# Reply + Reactions em comentários

> Hoje a aba "Atividades" do card lista comments + activities sem permitir reply nem reagir. Adicionar ambos: replies indentados 1 nível + 5 emojis de reação fixos.

## Escopo

### Dentro

- Schema: `Comment.parentCommentId` (self-ref opcional) + tabela `CommentReaction` (unique por `commentId, userId, emoji`).
- Backend: `POST /cards/:cardId/comments` aceita `parentCommentId`; novos endpoints `POST/DELETE /comments/:id/reactions/:emoji`.
- Notificação: quando alguém responde, autor do comment-pai recebe inbox+push (suprimido se for o próprio respondendo, ou se já foi mencionado no body).
- Realtime: evento `COMMENT_REACTION_UPDATED` no room do card.
- Frontend: botão "Responder" sob cada comment renderiza composer indentado; reactions renderizadas como chips agrupados por emoji com contador.

### Fora

- Reactions em Activities (CARD_MOVED etc) — só comments têm reply/reaction.
- Threads profundos: reply-de-reply é children do root (1 nível só).
- Emojis customizáveis. Set fechado: 👍 ❤️ 😂 🎉 👀.
- Notificação para reações (decisão: ruído desproporcional).
- Email — segue inbox+push.

## Etapas

### 1. Schema Prisma

```prisma
model Comment {
  // ...existentes
  parentCommentId String?
  parent          Comment?  @relation("CommentReply", fields: [parentCommentId], references: [id], onDelete: SetNull)
  replies         Comment[] @relation("CommentReply")
  reactions       CommentReaction[]

  @@index([parentCommentId])
}

model CommentReaction {
  id        String   @id @default(cuid())
  commentId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([commentId, userId, emoji])
  @@index([commentId])
}
```

User precisa de relação reversa `commentReactions CommentReaction[]`.

### 2. Migration

```sql
ALTER TABLE "Comment" ADD COLUMN "parentCommentId" TEXT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey"
  FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL;
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

CREATE TABLE "CommentReaction" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommentReaction_commentId_userId_emoji_key"
  ON "CommentReaction"("commentId", "userId", "emoji");
CREATE INDEX "CommentReaction_commentId_idx" ON "CommentReaction"("commentId");
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE;
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
```

### 3. Backend comments

- `CreateCommentSchema` ganha `parentCommentId: z.string().cuid().optional()`.
- `commentsService.create()`: se `parentCommentId` setado, valida que pertence ao mesmo card. Notifica autor do parent (se diferente do current user E não está em `mentions`).
- Listing inclui `parentCommentId` + `reactions: { emoji, userId, user: { id, name, avatarUrl } }`.

### 4. Backend reactions

```ts
const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀'];

POST /api/v1/comments/:commentId/reactions   { emoji }
DELETE /api/v1/comments/:commentId/reactions/:emoji
```

- Toggle: POST faz upsert idempotente, DELETE remove.
- Permissão: qualquer membro do board onde o card está.
- Emite `COMMENT_REACTION_UPDATED` realtime no room do card.

### 5. Frontend queries

- `CommentNode` ganha `parentCommentId`, `reactions: ReactionGroup[]`.
- `cardsQueries.detail` invalida quando recebe `COMMENT_REACTION_UPDATED`.
- `toggleReaction(commentId, emoji)` — optimistic update.

### 6. Frontend UI

- Em `card-modal` aba Atividades, cada comment ganha:
  - Linha de chips de reação (apenas se há reações OU em hover/focus).
  - Botão "+" pra picker (popover com 5 emojis).
  - Botão "Responder" → abre composer indentado abaixo.
- Replies aparecem indentadas (`pl-8`) com linha de conexão lateral à esquerda.

## Critérios de aceite

- [ ] Migration aplica sem dados perdidos.
- [ ] Posso responder um comment; reply aparece indentado.
- [ ] Reply-de-reply vira reply do root (testar com 3 níveis na chamada → última deve aparecer no mesmo nível que a primeira reply).
- [ ] Autor do parent recebe notificação; se eu sou o autor, não recebe.
- [ ] Posso reagir com 👍; clicar de novo remove. Chip mostra contador + meu avatar quando reagi.
- [ ] Reação aparece em outras abas via Socket.IO em <1s.
- [ ] Typecheck + lint verdes.

## Riscos / decisões

- **1 nível de thread**: simplifica UI e leitura. Slack/Linear fazem assim. Reply-de-reply é flattened pro root no backend.
- **Reactions sem notif**: sinal leve. Quem quiser ver abre o card.
- **5 emojis fixos**: evita "qual escolher?" virar feature. Pode expandir depois se houver demanda.
- **Mentions em reply**: backend trata normalmente. Se autor do parent já está em mentions, não duplica notif.
- **Soft-delete de parent**: replies ficam órfãs com `parentCommentId` apontando pra um comment com `deletedAt`. UI esconde o parent mas mantém replies visíveis com placeholder "_comentário removido_".

## Follow-ups

- Notif de reação opt-in por user (preferência granular).
- Reactions em Activities (se aparecer demanda).
- Threads profundos com colapso (se cards virarem discussões longas).
