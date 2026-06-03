-- Lixeira (soft delete) pra Card e List. Substitui o hard delete direto:
-- DELETE /cards/:id agora vira soft (seta deletedAt); DELETE /cards/:id/permanent
-- so funciona se deletedAt != null e ator e OWNER/ADMIN. Cron diario purga
-- fisicamente o que estiver na lixeira ha mais de 90 dias.
--
-- Filtro deletedAt IS NULL e aplicado em TODAS as queries de Card/List via
-- Prisma extension (apps/api/src/common/prisma/soft-delete.extension.ts) —
-- TrashService bypassa via raw queries / unsafe extension scope.

-- AlterEnum: novos tipos de Activity pra lixeira (audit log do que
-- deletePermanent legacy nao tinha).
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CARD_TRASHED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CARD_RESTORED_FROM_TRASH';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CARD_DELETED_PERMANENTLY';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LIST_TRASHED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LIST_RESTORED_FROM_TRASH';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'LIST_DELETED_PERMANENTLY';

-- AlterTable: Card ganha deletedAt + deletedById.
ALTER TABLE "Card" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Card" ADD COLUMN "deletedById" TEXT;

-- AlterTable: List ganha deletedAt + deletedById.
ALTER TABLE "List" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "List" ADD COLUMN "deletedById" TEXT;

-- Indice pra TrashService listar + cron auto-purge.
CREATE INDEX "Card_organizationId_deletedAt_idx"
  ON "Card"("organizationId", "deletedAt");
CREATE INDEX "List_organizationId_deletedAt_idx"
  ON "List"("organizationId", "deletedAt");

-- FK pra deletedBy (SET NULL: usuario excluido nao apaga historico da lixeira).
ALTER TABLE "Card"
  ADD CONSTRAINT "Card_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "List"
  ADD CONSTRAINT "List_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
