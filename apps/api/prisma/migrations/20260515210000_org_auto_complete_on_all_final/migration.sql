-- Flag Org-level: auto-marcar Card como COMPLETED quando todas as
-- CardPresences ativas estao em coluna isFinalList=true. Reverte para
-- ACTIVE quando uma presence sai de final. CANCELED nunca muda.
-- Default false: opt-in explicito por Org.

ALTER TABLE "Organization"
  ADD COLUMN "autoCompleteCardWhenAllFinal" BOOLEAN NOT NULL DEFAULT false;
