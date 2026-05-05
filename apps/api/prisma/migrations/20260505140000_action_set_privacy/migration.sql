-- Doc 25 V1.1: action de automacao SET_PRIVACY pra alterar privacidade
-- do card automaticamente quando entra/sai de coluna.
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'SET_PRIVACY';
