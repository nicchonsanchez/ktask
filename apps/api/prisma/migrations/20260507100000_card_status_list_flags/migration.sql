-- Doc 42: 4 estados de card (Ummense-style) + flags isFinalList/isBacklog em List
-- - Card.status: ACTIVE | COMPLETED | WAITING | CANCELED (default ACTIVE)
-- - List.isFinalList: coluna "Finalizado" especial (faixa expansivel a direita)
-- - List.isBacklog: coluna "Backlog" especial (faixa expansivel a esquerda)
-- Backfill: cards com completedAt nao-null viram status=COMPLETED.

-- 1. Cria enum
DO $$ BEGIN
  CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WAITING', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Adiciona coluna em Card com default ACTIVE
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE';

-- 3. Backfill: cards com completedAt nao-null viram COMPLETED
UPDATE "Card" SET "status" = 'COMPLETED' WHERE "completedAt" IS NOT NULL;

-- 4. Adiciona flags em List
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "isFinalList" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "isBacklog" BOOLEAN NOT NULL DEFAULT false;

-- 5. Indice em Card.status pra acelerar filtros (ex: listar so ACTIVE)
CREATE INDEX IF NOT EXISTS "Card_organizationId_status_idx" ON "Card" ("organizationId", "status");
