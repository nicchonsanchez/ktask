-- Reply (self-ref em Comment) + CommentReaction (emoji por user).

ALTER TABLE "Comment" ADD COLUMN "parentCommentId" TEXT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey"
  FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
