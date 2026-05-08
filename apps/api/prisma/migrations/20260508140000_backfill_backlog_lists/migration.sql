-- Garante que todo board (nao-arquivado) tenha pelo menos 1 lista
-- isBacklog=true. Espelho do mesmo trabalho que foi feito pra
-- isFinalList no 20260508130000.
--
-- Diferenca: nao tem partial unique pra isBacklog — multiplas
-- backlog colunas sao caso de uso valido (ex: 'Entrada' +
-- 'Informacoes' coexistindo).
--
-- Idempotente: WHERE NOT EXISTS no INSERT garante no-op em
-- ambientes que ja rodaram.

-- Limpa flag das arquivadas (a invariante so vale pra listas vivas)
UPDATE "List" SET "isBacklog" = false WHERE "isArchived" = true AND "isBacklog" = true;

-- Backfill: cria coluna "Backlog" no inicio de todo board nao-arquivado
-- que ainda nao tem nenhuma isBacklog=true ativa.
INSERT INTO "List" (id, "organizationId", "boardId", name, position, "isFinalList", "isBacklog", "isArchived", "createdAt", "updatedAt")
SELECT
  'cm' || replace(gen_random_uuid()::text, '-', ''),
  b."organizationId",
  b.id,
  'Backlog',
  -- Posicao = metade da menor position das listas vivas (vai pra antes de tudo)
  COALESCE(
    (SELECT MIN(position) / 2.0 FROM "List" WHERE "boardId" = b.id AND "isArchived" = false),
    1024
  ),
  false,
  true,
  false,
  NOW(),
  NOW()
FROM "Board" b
WHERE b."isArchived" = false
  AND NOT EXISTS (
    SELECT 1 FROM "List" l
    WHERE l."boardId" = b.id AND l."isBacklog" = true AND l."isArchived" = false
  );
