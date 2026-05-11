-- Bloqueia card.parentCardId apontando pra ele mesmo (self-loop).
-- Bug do Ummense: a coluna 15 do CSV (Cards Filhos) as vezes
-- contem o proprio nome do card. O importer ja foi corrigido pra
-- pular esse caso, mas o constraint aqui e cinto-suspensorio contra
-- scripts ad-hoc e SQL direto.

-- Defensive cleanup (idempotente — UPDATE 0 em ambientes ja limpos)
UPDATE "Card" SET "parentCardId" = NULL WHERE "parentCardId" = id;

ALTER TABLE "Card"
  ADD CONSTRAINT "Card_no_self_parent_check"
  CHECK ("parentCardId" IS NULL OR "parentCardId" <> id);
