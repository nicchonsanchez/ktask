-- Doc 52 (Desempenho da Equipe): origem de cada Activity.
-- 100% aditivo: novo enum + nova coluna com default + novo indice + backfill
-- que so altera a coluna nova. Nenhum dado existente e removido/alterado.

-- CreateEnum
CREATE TYPE "ActivityOrigin" AS ENUM ('USER', 'AUTOMATION', 'SYSTEM', 'APPROVAL', 'IMPORT');

-- AlterTable (Postgres 11+: default constante = operacao de metadado, sem reescrever a tabela)
ALTER TABLE "Activity" ADD COLUMN "origin" "ActivityOrigin" NOT NULL DEFAULT 'USER';

-- CreateIndex: relatorio por pessoa no periodo
CREATE INDEX "Activity_organizationId_actorId_createdAt_idx" ON "Activity"("organizationId", "actorId", "createdAt");

-- Backfill do historico. Criterios validados em producao (06/10/2026):
-- todas as Activities gravadas pela engine de automacoes tem
-- payload.via = 'automation' / 'automation-whatsapp' OU payload.automationId;
-- status auto-sync tem payload.kind = 'card.status.autoSync';
-- importadores tem payload.via = 'ummense-import' / 'ummense-import-v2'.
-- Os tres conjuntos nao se sobrepoem. Reversivel: UPDATE ... SET origin = 'USER'.
UPDATE "Activity" SET "origin" = 'AUTOMATION'
WHERE "origin" = 'USER'
  AND (("payload"->>'via') LIKE 'automation%' OR "payload" ? 'automationId');

UPDATE "Activity" SET "origin" = 'SYSTEM'
WHERE "origin" = 'USER'
  AND ("payload"->>'kind') = 'card.status.autoSync';

UPDATE "Activity" SET "origin" = 'IMPORT'
WHERE "origin" = 'USER'
  AND ("payload"->>'via') LIKE 'ummense-import%';
