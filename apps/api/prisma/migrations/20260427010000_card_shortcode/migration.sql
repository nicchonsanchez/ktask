-- Card.shortCode: identificador curto humano-legivel ("#412") por Org.
-- Sequencial via Organization.cardSequence; importadores podem gravar
-- valores literais (ex: ID Ummense "20250409000751") sem mexer no counter.

ALTER TABLE "Organization"
  ADD COLUMN "cardSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Card"
  ADD COLUMN "shortCode" TEXT;

-- Backfill: gera shortCode 1..N pra cards existentes em ordem de createdAt
-- por Org. Updates organization.cardSequence pro maior valor atribuido.
DO $$
DECLARE
  org_record RECORD;
  card_record RECORD;
  counter INTEGER;
BEGIN
  FOR org_record IN SELECT id FROM "Organization" LOOP
    counter := 0;
    FOR card_record IN
      SELECT id FROM "Card"
      WHERE "organizationId" = org_record.id
      ORDER BY "createdAt" ASC, id ASC
    LOOP
      counter := counter + 1;
      UPDATE "Card" SET "shortCode" = counter::TEXT WHERE id = card_record.id;
    END LOOP;
    UPDATE "Organization" SET "cardSequence" = counter WHERE id = org_record.id;
  END LOOP;
END $$;

-- Indice unico composto: mesmo shortCode pode existir em Orgs diferentes
CREATE UNIQUE INDEX "Card_organizationId_shortCode_key"
  ON "Card"("organizationId", "shortCode");
