-- Suporte à página inicial pessoal (home nova estilo Ummense):
-- 1. Foreign keys + indexes em ChecklistItem (assignee, doneBy)
-- 2. Tabela CardVisit (track de cards abertos pra "Cards recentes")

-- ChecklistItem.assignee → User
ALTER TABLE "ChecklistItem"
  ADD CONSTRAINT "ChecklistItem_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ChecklistItem.doneBy → User
ALTER TABLE "ChecklistItem"
  ADD CONSTRAINT "ChecklistItem_doneById_fkey"
  FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index composto pra acelerar query da home: "tarefas do user X agrupadas por prazo"
CREATE INDEX "ChecklistItem_assigneeId_dueDate_isDone_idx"
  ON "ChecklistItem" ("assigneeId", "dueDate", "isDone");

-- CardVisit: 1 row por (user, card), atualizada em vez de inserida.
CREATE TABLE "CardVisit" (
  "userId"    TEXT NOT NULL,
  "cardId"    TEXT NOT NULL,
  "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CardVisit_pkey" PRIMARY KEY ("userId", "cardId")
);

ALTER TABLE "CardVisit"
  ADD CONSTRAINT "CardVisit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardVisit"
  ADD CONSTRAINT "CardVisit_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CardVisit_userId_visitedAt_idx" ON "CardVisit" ("userId", "visitedAt" DESC);
