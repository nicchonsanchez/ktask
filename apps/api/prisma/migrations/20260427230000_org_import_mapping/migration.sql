-- OrgImportMapping: lembra mapeamentos confirmados de import (nome CSV
-- -> User/List do KTask) por Org. Proximo import com mesmo nome ja
-- chega pre-mapeado.

CREATE TABLE "OrgImportMapping" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "sourceName"     TEXT NOT NULL,
  "targetId"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgImportMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgImportMapping_organizationId_kind_sourceName_key"
  ON "OrgImportMapping"("organizationId", "kind", "sourceName");
CREATE INDEX "OrgImportMapping_organizationId_kind_idx"
  ON "OrgImportMapping"("organizationId", "kind");

ALTER TABLE "OrgImportMapping"
  ADD CONSTRAINT "OrgImportMapping_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
