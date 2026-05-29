-- Aceita intervalo fracionado (0.5h = 30min). Antes eram Int, agora Float
-- pra suportar UX com seletor horas/minutos onde 30min vira 0.5 no banco.
-- ALTER TYPE preserva os valores existentes (4 vira 4.0, 4.5 funciona).

ALTER TABLE "Organization"
  ALTER COLUMN "approvalReminderIntervalHours" TYPE DOUBLE PRECISION;

ALTER TABLE "CardApproval"
  ALTER COLUMN "reminderIntervalHoursOverride" TYPE DOUBLE PRECISION;
