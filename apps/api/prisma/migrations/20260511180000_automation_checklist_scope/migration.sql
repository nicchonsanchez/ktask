-- Doc 48: Automação por escopo de checklist/item de checklist.
-- Adiciona dois novos triggers e dois campos de escopo opcional ao
-- modelo Automation. Triggers existentes não são afetados.

-- 1) Novos valores do enum AutomationTrigger
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'CHECKLIST_ITEM_DONE';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'CHECKLIST_COMPLETED';

-- 2) Campos de escopo (Postgres aceita um ALTER TABLE com várias adds)
ALTER TABLE "Automation"
  ADD COLUMN IF NOT EXISTS "scopeChecklistId"     TEXT,
  ADD COLUMN IF NOT EXISTS "scopeChecklistItemId" TEXT;

-- 3) Foreign keys com ON DELETE CASCADE (se o checklist/item for apagado,
-- a automação também some — coerente com o comportamento de listId).
ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_scopeChecklistId_fkey"
  FOREIGN KEY ("scopeChecklistId") REFERENCES "Checklist"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_scopeChecklistItemId_fkey"
  FOREIGN KEY ("scopeChecklistItemId") REFERENCES "ChecklistItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Índices parciais pra suportar a query mais comum: "buscar automações
-- ativas escopadas a este item/checklist" (lookup no listener do engine).
CREATE INDEX IF NOT EXISTS "Automation_scopeChecklistId_isActive_idx"
  ON "Automation" ("scopeChecklistId", "isActive");
CREATE INDEX IF NOT EXISTS "Automation_scopeChecklistItemId_isActive_idx"
  ON "Automation" ("scopeChecklistItemId", "isActive");
