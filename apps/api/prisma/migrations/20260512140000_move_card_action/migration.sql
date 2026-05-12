-- Adiciona action type MOVE_CARD ao enum AutomationActionType.
-- Cenário: card entra em "Aprovacao" com tag "Urgente" → move pra "Em revisão".
-- Postgres exige ALTER TYPE ADD VALUE em statement separado.

ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'MOVE_CARD';
