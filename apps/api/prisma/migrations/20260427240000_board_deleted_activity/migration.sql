-- Adiciona BOARD_DELETED ao enum ActivityType
-- Usado pelo fluxo de exclusao definitiva de fluxo (doc 29).
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'BOARD_DELETED';
