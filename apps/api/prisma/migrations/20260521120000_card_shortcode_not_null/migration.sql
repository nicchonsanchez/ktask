-- Garante que Card.shortCode seja sempre preenchido.
--
-- Postgres trata NULLs como distintos em UNIQUE constraint, entao o
-- @@unique([organizationId, shortCode]) nao impede multiplos cards
-- sem shortCode na mesma Org. Helper de criacao
-- (create-card-with-presence) sempre seta via Organization.cardSequence,
-- e o importador tambem. Auditoria de 2026-05-21 confirmou 0 cards
-- com shortCode NULL em prod.
--
-- Se algum dia precisar permitir NULL de novo (ex: card draft sem
-- numero), reverter aqui e adicionar partial unique index:
--   CREATE UNIQUE INDEX ... WHERE "shortCode" IS NOT NULL;

ALTER TABLE "Card" ALTER COLUMN "shortCode" SET NOT NULL;
