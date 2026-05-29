-- Auditoria de envios de cobranca de aprovacao (inicial + resend manual +
-- lembrete automatico). 1 linha por (envio, reviewer). Sem retencao
-- automatica — volume esperado eh baixo (~20/dia) e indefinido eh aceitavel.

-- CreateEnum: tipo do envio (auto/manual/inicial).
CREATE TYPE "ApprovalDispatchKind" AS ENUM ('INITIAL', 'RESEND', 'REMINDER');

-- CreateEnum: canal do envio.
CREATE TYPE "ApprovalDispatchChannel" AS ENUM ('WHATSAPP', 'IN_APP');

-- CreateTable: log de envios.
CREATE TABLE "ApprovalDispatchLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "reviewerUserId" TEXT,
  "phone" TEXT,
  "recipientName" TEXT NOT NULL,
  "kind" "ApprovalDispatchKind" NOT NULL,
  "channel" "ApprovalDispatchChannel" NOT NULL,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "preview" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApprovalDispatchLog_pkey" PRIMARY KEY ("id")
);

-- Indices pra queries comuns:
-- 1. Painel historico por org (mais recente primeiro)
CREATE INDEX "ApprovalDispatchLog_organizationId_createdAt_idx"
  ON "ApprovalDispatchLog"("organizationId", "createdAt");

-- 2. Timeline por approval (drill-down do card)
CREATE INDEX "ApprovalDispatchLog_approvalId_createdAt_idx"
  ON "ApprovalDispatchLog"("approvalId", "createdAt");

-- 3. Drill-down por reviewer ("quantas cobrancas a Anna recebeu?")
CREATE INDEX "ApprovalDispatchLog_reviewerUserId_createdAt_idx"
  ON "ApprovalDispatchLog"("reviewerUserId", "createdAt");

-- 4. Filtro de falhas (success=false + canal)
CREATE INDEX "ApprovalDispatchLog_organizationId_success_channel_idx"
  ON "ApprovalDispatchLog"("organizationId", "success", "channel");

-- FK approval (cascade: approval deletada limpa logs).
ALTER TABLE "ApprovalDispatchLog"
  ADD CONSTRAINT "ApprovalDispatchLog_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "CardApproval"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FK reviewer (set null: user deletado nao apaga historico).
ALTER TABLE "ApprovalDispatchLog"
  ADD CONSTRAINT "ApprovalDispatchLog_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
