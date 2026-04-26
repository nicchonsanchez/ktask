-- Card Approvals: revisão por cliente (interno ou externo via link tokenizado).
-- Inclui:
--   - novo enum ApprovalStatus
--   - novo enum CardMemberRole + coluna role em CardMember
--   - 2 valores no enum AutomationTrigger (CARD_APPROVED, CARD_REJECTED)
--   - colunas em User (phone, notifyApprovalsOnWhatsApp)
--   - coluna em Activity (automationRunId) — pra distinguir ação manual vs automação no undo
--   - tabelas CardApproval, CardApprovalReviewer

-- ===== Enums =====
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVERTED');

CREATE TYPE "CardMemberRole" AS ENUM ('MEMBER', 'REVIEWER');

ALTER TYPE "AutomationTrigger" ADD VALUE 'CARD_APPROVED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CARD_REJECTED';

-- ===== User: telefone + opt-in pra WhatsApp =====
ALTER TABLE "User"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "notifyApprovalsOnWhatsApp" BOOLEAN NOT NULL DEFAULT false;

-- ===== CardMember: papel (MEMBER executor / REVIEWER cliente) =====
ALTER TABLE "CardMember"
  ADD COLUMN "role" "CardMemberRole" NOT NULL DEFAULT 'MEMBER';

-- ===== Activity: link opcional pro AutomationRun que originou a ação =====
ALTER TABLE "Activity"
  ADD COLUMN "automationRunId" TEXT;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_automationRunId_fkey"
  FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Activity_automationRunId_idx" ON "Activity"("automationRunId");

-- ===== CardApproval =====
CREATE TABLE "CardApproval" (
  "id"                     TEXT NOT NULL,
  "cardId"                 TEXT NOT NULL,
  "organizationId"         TEXT NOT NULL,
  "requestedById"          TEXT NOT NULL,
  "status"                 "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"              TIMESTAMP(3),
  "decidedById"            TEXT,
  "decidedByExternalName"  TEXT,
  "note"                   TEXT,
  "defaultOnApproveListId" TEXT,
  "defaultOnRejectListId"  TEXT,
  "sideEffects"            JSONB,
  "revertedAt"             TIMESTAMP(3),
  "revertedById"           TEXT,
  "revertReason"           TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardApproval_cardId_idx" ON "CardApproval"("cardId");
CREATE INDEX "CardApproval_organizationId_status_requestedAt_idx" ON "CardApproval"("organizationId", "status", "requestedAt");
CREATE INDEX "CardApproval_status_idx" ON "CardApproval"("status");

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_revertedById_fkey"
  FOREIGN KEY ("revertedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_defaultOnApproveListId_fkey"
  FOREIGN KEY ("defaultOnApproveListId") REFERENCES "List"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CardApproval"
  ADD CONSTRAINT "CardApproval_defaultOnRejectListId_fkey"
  FOREIGN KEY ("defaultOnRejectListId") REFERENCES "List"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== CardApprovalReviewer =====
CREATE TABLE "CardApprovalReviewer" (
  "id"           TEXT NOT NULL,
  "approvalId"   TEXT NOT NULL,
  "userId"       TEXT,
  "phone"        TEXT,
  "externalName" TEXT,
  "accessToken"  TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "notifiedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardApprovalReviewer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardApprovalReviewer_accessToken_key" ON "CardApprovalReviewer"("accessToken");
CREATE INDEX "CardApprovalReviewer_approvalId_idx" ON "CardApprovalReviewer"("approvalId");
CREATE INDEX "CardApprovalReviewer_userId_idx" ON "CardApprovalReviewer"("userId");
CREATE INDEX "CardApprovalReviewer_accessToken_idx" ON "CardApprovalReviewer"("accessToken");

ALTER TABLE "CardApprovalReviewer"
  ADD CONSTRAINT "CardApprovalReviewer_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "CardApproval"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardApprovalReviewer"
  ADD CONSTRAINT "CardApprovalReviewer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
