-- Contacts (CRM lite): Contact + CardContact + ContactType enum.
-- Cross-reference com User feito on-demand pelo email/phone (sem FK).
-- Soft-delete via Contact.deletedAt; cards historicos ainda referenciam.

CREATE TYPE "ContactType" AS ENUM ('PERSON', 'COMPANY');

-- ===== Activity types (5 novos) =====
ALTER TYPE "ActivityType" ADD VALUE 'CARD_CONTACT_LINKED';
ALTER TYPE "ActivityType" ADD VALUE 'CARD_CONTACT_UNLINKED';
ALTER TYPE "ActivityType" ADD VALUE 'CONTACT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'CONTACT_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'CONTACT_DELETED';

-- ===== Contact =====
CREATE TABLE "Contact" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           "ContactType" NOT NULL,
  "name"           TEXT NOT NULL,
  "email"          TEXT,
  "phone"          TEXT,
  "document"       TEXT,
  "note"           TEXT,
  "parentId"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contact_organizationId_type_idx" ON "Contact"("organizationId", "type");
CREATE INDEX "Contact_organizationId_name_idx" ON "Contact"("organizationId", "name");
CREATE INDEX "Contact_organizationId_email_idx" ON "Contact"("organizationId", "email");
CREATE INDEX "Contact_organizationId_phone_idx" ON "Contact"("organizationId", "phone");
CREATE INDEX "Contact_parentId_idx" ON "Contact"("parentId");

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== CardContact (junction N:N) =====
CREATE TABLE "CardContact" (
  "cardId"    TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardContact_pkey" PRIMARY KEY ("cardId", "contactId")
);

CREATE INDEX "CardContact_contactId_idx" ON "CardContact"("contactId");

ALTER TABLE "CardContact"
  ADD CONSTRAINT "CardContact_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardContact"
  ADD CONSTRAINT "CardContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
