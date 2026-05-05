-- Doc 25 V1: privacidade por card (2 niveis).
CREATE TYPE "CardPrivacy" AS ENUM ('PUBLIC', 'TEAM_ONLY');

ALTER TABLE "Card" ADD COLUMN "privacy" "CardPrivacy" NOT NULL DEFAULT 'PUBLIC';

-- Indice composto pra acelerar filtros: lista cards de um board com
-- determinado nivel de privacidade.
CREATE INDEX "Card_boardId_privacy_idx" ON "Card"("boardId", "privacy");
