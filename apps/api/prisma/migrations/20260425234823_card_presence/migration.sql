-- CreateTable
CREATE TABLE "CardPresence" (
    "cardId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "CardPresence_pkey" PRIMARY KEY ("cardId","boardId")
);

-- CreateIndex
CREATE INDEX "CardPresence_boardId_listId_position_idx" ON "CardPresence"("boardId", "listId", "position");

-- CreateIndex
CREATE INDEX "CardPresence_boardId_completedAt_idx" ON "CardPresence"("boardId", "completedAt");

-- CreateIndex
CREATE INDEX "CardPresence_boardId_removedAt_idx" ON "CardPresence"("boardId", "removedAt");

-- AddForeignKey
ALTER TABLE "CardPresence" ADD CONSTRAINT "CardPresence_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPresence" ADD CONSTRAINT "CardPresence_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPresence" ADD CONSTRAINT "CardPresence_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPresence" ADD CONSTRAINT "CardPresence_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: cria 1 presença por card existente, espelhando o estado atual
-- (boardId/listId/position/completedAt/completedById). Cards arquivados também
-- ganham presença pra preservar histórico — frontend filtra por isArchived.
INSERT INTO "CardPresence" ("cardId", "boardId", "listId", "position", "completedAt", "completedById", "addedAt", "removedAt")
SELECT id, "boardId", "listId", position, "completedAt", "completedById", "createdAt", NULL
FROM "Card";
