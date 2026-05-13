-- Doc 50: vincula Contact a um User opcional (1:1).
-- Quando setado, CRM usa o User como fonte de identidade
-- (name/email/phone/avatar read-only).

ALTER TABLE "Contact" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Contact_userId_key" ON "Contact"("userId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ActivityType: novos eventos pra rastrear vínculo/desvínculo
ALTER TYPE "ActivityType" ADD VALUE 'CONTACT_LINKED_TO_USER';
ALTER TYPE "ActivityType" ADD VALUE 'CONTACT_UNLINKED_FROM_USER';
