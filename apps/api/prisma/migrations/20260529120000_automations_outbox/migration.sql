-- AlterEnum: novo status pra runs que ficaram travadas em RUNNING e foram
-- recuperadas pelo sweeper (processo morreu durante execucao).
ALTER TYPE "AutomationRunStatus" ADD VALUE 'ABANDONED';

-- CreateEnum: escopo do trigger persistido na outbox.
CREATE TYPE "AutomationOutboxScope" AS ENUM ('LIST', 'CHECKLIST', 'CHECKLIST_ITEM');

-- CreateTable: AutomationOutbox - persiste triggers na mesma TXN que altera
-- o card/checklist. Worker processa em loop com retry+backoff. Sem isso,
-- evento se perdia entre events.emit() e @OnEvent quando processo caia.
CREATE TABLE "AutomationOutbox" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "trigger" "AutomationTrigger" NOT NULL,
  "cardId" TEXT NOT NULL,
  "scopeKind" "AutomationOutboxScope" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "chainDepth" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: polling do worker (processedAt IS NULL + nextAttemptAt <= now).
CREATE INDEX "AutomationOutbox_processedAt_nextAttemptAt_idx"
  ON "AutomationOutbox"("processedAt", "nextAttemptAt");

-- CreateIndex: painel admin (backlog por org).
CREATE INDEX "AutomationOutbox_organizationId_createdAt_idx"
  ON "AutomationOutbox"("organizationId", "createdAt");

-- CreateIndex: busca por card (debug/reprocessar).
CREATE INDEX "AutomationOutbox_cardId_idx" ON "AutomationOutbox"("cardId");

-- CreateTable: AutomationFailure - dead-letter consolidada (1 entry por
-- evento que falhou definitivamente). Mantem payload pra reprocessar.
CREATE TABLE "AutomationFailure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "runId" TEXT,
  "trigger" "AutomationTrigger" NOT NULL,
  "actionType" "AutomationActionType" NOT NULL,
  "attempts" INTEGER NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "errorStack" TEXT,
  "payloadSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,

  CONSTRAINT "AutomationFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: painel admin (nao-resolvidas, mais recentes primeiro).
CREATE INDEX "AutomationFailure_organizationId_resolvedAt_createdAt_idx"
  ON "AutomationFailure"("organizationId", "resolvedAt", "createdAt");

-- CreateIndex: drill-down por automacao.
CREATE INDEX "AutomationFailure_automationId_idx"
  ON "AutomationFailure"("automationId");

-- CreateIndex: drill-down por card.
CREATE INDEX "AutomationFailure_cardId_idx" ON "AutomationFailure"("cardId");

-- AddForeignKey: cascade quando a Automation eh deletada (limpa historico).
ALTER TABLE "AutomationFailure"
  ADD CONSTRAINT "AutomationFailure_automationId_fkey"
  FOREIGN KEY ("automationId") REFERENCES "Automation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
