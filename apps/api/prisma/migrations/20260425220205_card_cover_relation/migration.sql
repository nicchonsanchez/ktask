-- Adiciona FK Card.coverAttachmentId -> Attachment.id (relação nomeada
-- "CardCover"). A coluna coverAttachmentId já existia desde a migration
-- inicial; faltava a foreign key pra Prisma poder fazer JOIN/include.
--
-- ON DELETE SET NULL: se o anexo da capa for removido, o card mantém-se
-- mas sem capa (ao invés de cascatear delete e perder o card).

ALTER TABLE "Card"
  ADD CONSTRAINT "Card_coverAttachmentId_fkey"
  FOREIGN KEY ("coverAttachmentId") REFERENCES "Attachment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
