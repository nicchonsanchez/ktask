-- AlterTable: rememberMe controla TTL longa (90d) vs curta (1d) na rotação de refresh
ALTER TABLE "Session" ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT true;
