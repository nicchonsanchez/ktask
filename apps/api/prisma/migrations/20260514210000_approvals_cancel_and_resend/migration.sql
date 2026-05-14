-- Adiciona valor CANCELED ao enum ApprovalStatus.
ALTER TYPE "ApprovalStatus" ADD VALUE 'CANCELED';

-- Adiciona campos de cancelamento + persistencia da mensagem original
-- + contadores de notificacao em CardApproval.
ALTER TABLE "CardApproval"
  ADD COLUMN "message" TEXT,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "canceledById" TEXT,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "lastNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "notifyCount" INTEGER NOT NULL DEFAULT 0;

-- FK pro user que cancelou.
ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_canceledById_fkey"
  FOREIGN KEY ("canceledById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
