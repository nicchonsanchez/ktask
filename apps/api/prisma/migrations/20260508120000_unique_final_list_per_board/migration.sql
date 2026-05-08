-- Garante que cada board tenha no maximo 1 coluna marcada como Finalizado.
-- Partial unique index: indexa apenas linhas onde isFinalList = true.
-- O service ja faz swap idempotente; isso aqui e cinto-e-suspensorio
-- pra capturar bypass via SQL direto ou seeds antigos.

-- Antes de criar o indice, normaliza dados existentes (se houver
-- duplicatas em algum board, mantem so a de menor position).
WITH ranked AS (
  SELECT
    id,
    "boardId",
    ROW_NUMBER() OVER (
      PARTITION BY "boardId"
      ORDER BY "position" ASC, "createdAt" ASC
    ) AS rn
  FROM "List"
  WHERE "isFinalList" = true
)
UPDATE "List"
SET "isFinalList" = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "List_boardId_isFinalList_unique"
  ON "List"("boardId")
  WHERE "isFinalList" = true;
