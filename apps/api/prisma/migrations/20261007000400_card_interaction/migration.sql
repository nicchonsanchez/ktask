-- Doc 52 (Fase 3, D9): registro de contato no card sem movimentacao.
-- 100% aditivo: tabela nova. Nao altera Comment/Card/Contact.

-- CreateTable
CREATE TABLE "CardInteraction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "customLabel" TEXT,
    "commentId" TEXT,
    "contactId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CardInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardInteraction_commentId_key" ON "CardInteraction"("commentId");

-- CreateIndex
CREATE INDEX "CardInteraction_organizationId_userId_occurredAt_idx" ON "CardInteraction"("organizationId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "CardInteraction_organizationId_occurredAt_idx" ON "CardInteraction"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "CardInteraction_cardId_occurredAt_idx" ON "CardInteraction"("cardId", "occurredAt");

-- CreateIndex
CREATE INDEX "CardInteraction_boardId_occurredAt_idx" ON "CardInteraction"("boardId", "occurredAt");

-- AddForeignKey
ALTER TABLE "CardInteraction" ADD CONSTRAINT "CardInteraction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInteraction" ADD CONSTRAINT "CardInteraction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInteraction" ADD CONSTRAINT "CardInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInteraction" ADD CONSTRAINT "CardInteraction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInteraction" ADD CONSTRAINT "CardInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

