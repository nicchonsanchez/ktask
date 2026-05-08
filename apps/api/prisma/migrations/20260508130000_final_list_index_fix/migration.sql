-- Ajusta a constraint de unicidade da coluna Finalizado pra incluir
-- "isArchived = false" no filtro. A versao anterior (20260508120000)
-- so checava isFinalList=true, o que impedia INSERT de uma nova
-- isFinalList=true viva quando o board tinha uma antiga arquivada
-- com a flag (caso comum em dados pre-doc-42).
--
-- Pareado com o helper ListsService.ensureFinalList que faz backfill
-- idempotente.

-- Limpa flag das arquivadas — invariante so vale pra listas vivas
UPDATE "List" SET "isFinalList" = false WHERE "isArchived" = true AND "isFinalList" = true;

-- Recria o partial unique com filtro de arquivamento
DROP INDEX IF EXISTS "List_boardId_isFinalList_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "List_boardId_isFinalList_unique"
  ON "List"("boardId")
  WHERE "isFinalList" = true AND "isArchived" = false;

-- Backfill: cria coluna "Finalizado" em todo board nao-arquivado que ainda
-- nao tem nenhuma lista isFinalList=true ativa. Idempotente.
INSERT INTO "List" (id, "organizationId", "boardId", name, position, "isFinalList", "isBacklog", "isArchived", "createdAt", "updatedAt")
SELECT
  'cm' || replace(gen_random_uuid()::text, '-', ''),
  b."organizationId",
  b.id,
  'Finalizado',
  COALESCE((SELECT MAX(position) FROM "List" WHERE "boardId" = b.id AND "isArchived" = false), 0) + 1024,
  true,
  false,
  false,
  NOW(),
  NOW()
FROM "Board" b
WHERE b."isArchived" = false
  AND NOT EXISTS (
    SELECT 1 FROM "List" l
    WHERE l."boardId" = b.id AND l."isFinalList" = true AND l."isArchived" = false
  );
