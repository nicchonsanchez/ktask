-- Fix do quadro Tecnologia: religar Backlog/Finalizado reais (com flags)
-- e absorver os 29+219 cards que ficaram nas duplicatas-lixo da import.
--
-- IDs hardcoded apos inspecao:
--   board: cmoxocewn0i25o307f06lwtwe
--   Backlog real (archived, isBacklog=t):  cmoxoceww0i28o307pvylp893  (pos 512)
--   Backlog lixo (active, isBacklog=f):    cmoxocgz70i2vo3079aqrgdh8  (pos 1024, 29 cards)
--   Concluido real (archived, isFinalList=t): cmoxoceww0i2bo30768awkgn0  (pos 3072)
--   Finalizado lixo (active, isFinalList=f):  cmoxockem0i41o307aq5lo56s  (pos 6144, 219 cards)

BEGIN;

-- 1) Move 29 presences do Backlog-lixo pro Backlog real
UPDATE "CardPresence" SET "listId" = 'cmoxoceww0i28o307pvylp893'
  WHERE "listId" = 'cmoxocgz70i2vo3079aqrgdh8' AND "removedAt" IS NULL;

-- 2) Desarquiva Backlog real (mantem posicao 512 = leftmost)
UPDATE "List" SET "isArchived" = false, "updatedAt" = NOW()
  WHERE id = 'cmoxoceww0i28o307pvylp893';

-- 3) Arquiva Backlog-lixo + remove flag (cinto-suspensorio)
UPDATE "List" SET "isArchived" = true, "isBacklog" = false, "updatedAt" = NOW()
  WHERE id = 'cmoxocgz70i2vo3079aqrgdh8';

-- 4) Move 219 presences do Finalizado-lixo pro Concluido real
UPDATE "CardPresence" SET "listId" = 'cmoxoceww0i2bo30768awkgn0'
  WHERE "listId" = 'cmoxockem0i41o307aq5lo56s' AND "removedAt" IS NULL;

-- 5) Desarquiva Concluido real, renomeia pra Finalizado, joga pro fim
UPDATE "List" SET "isArchived" = false, name = 'Finalizado', position = 7168, "updatedAt" = NOW()
  WHERE id = 'cmoxoceww0i2bo30768awkgn0';

-- 6) Arquiva Finalizado-lixo + remove flag
UPDATE "List" SET "isArchived" = true, "isFinalList" = false, "updatedAt" = NOW()
  WHERE id = 'cmoxockem0i41o307aq5lo56s';

-- Sanity check
SELECT l.name, l.position as pos, l."isBacklog" as bk, l."isFinalList" as fl, l."isArchived" as ar,
  (SELECT COUNT(*) FROM "CardPresence" cp WHERE cp."listId"=l.id AND cp."removedAt" IS NULL) as cards
FROM "List" l WHERE l."boardId" = 'cmoxocewn0i25o307f06lwtwe'
ORDER BY l."isArchived", l.position;

COMMIT;
