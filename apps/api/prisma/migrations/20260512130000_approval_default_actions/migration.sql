-- Acoes default a executar quando reviewer decidir uma CardApproval.
-- Alem de mover card (defaultOn*ListId que ja existia), agora permite
-- configurar tags a adicionar/remover. Shape em cada JSON:
--   { "addTagIds": ["cuid", ...], "removeTagIds": ["cuid", ...] }

ALTER TABLE "CardApproval"
  ADD COLUMN IF NOT EXISTS "onApproveActions" JSONB,
  ADD COLUMN IF NOT EXISTS "onRejectActions"  JSONB;
