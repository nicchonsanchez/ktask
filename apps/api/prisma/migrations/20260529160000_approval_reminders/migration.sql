-- AlterEnum: novo NotificationType pra lembretes de aprovacao.
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_REQUEST';

-- Lembretes automaticos de aprovacao pendente em horas uteis.
-- Settings ficam na propria Organization (sem tabela nova) — segue o
-- padrao do autoCompleteCardWhenAllFinal. Override per-approval em
-- CardApproval pra casos especificos (urgente / silenciar).

-- AlterTable: Organization ganha 5 campos de settings de reminder.
ALTER TABLE "Organization"
  ADD COLUMN "approvalReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvalReminderIntervalHours" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "approvalReminderHourStart" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "approvalReminderHourEnd" INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN "approvalReminderMaxAttempts" INTEGER NOT NULL DEFAULT 5;

-- AlterTable: CardApproval ganha override + tracking de lembretes.
-- reminderCount e lastReminderAt sao diferentes de notifyCount/lastNotifiedAt:
-- esses ultimos contam initial + resends manuais (botao "Cobrar"); os novos
-- contam SO lembretes automaticos do cron. Separa pra metricas e regras.
ALTER TABLE "CardApproval"
  ADD COLUMN "reminderDisabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminderIntervalHoursOverride" INTEGER,
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReminderAt" TIMESTAMP(3);

-- Indice pra query do cron: busca approvals pendentes com lembrete devido.
-- Cobre o WHERE (status = PENDING AND reminderDisabled = false). Os filtros
-- de tempo (lastReminderAt/requestedAt + interval) sao computados depois
-- via comparacao na app — manter indice simples.
CREATE INDEX "CardApproval_status_reminderDisabled_idx"
  ON "CardApproval"("status", "reminderDisabled");
