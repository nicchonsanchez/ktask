-- AlterTable: permite TimeEntry sem card (timer livre iniciado pelo header sem contexto)
ALTER TABLE "TimeEntry" ALTER COLUMN "cardId" DROP NOT NULL;
