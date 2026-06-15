-- AlterEnum: adiciona CARD_PRIMARY_CHANGED ao ActivityType.
-- Usado quando o user troca qual fluxo (board) é o "principal" de um card
-- multi-fluxo (PATCH /cards/:cardId/flows/:boardId/primary).
ALTER TYPE "ActivityType" ADD VALUE 'CARD_PRIMARY_CHANGED';
