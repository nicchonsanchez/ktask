-- Doc 47: flag visual setado por automation (FLAG_OVERDUE/FLAG_DUE_TODAY).
-- Valores: 'orange' | 'yellow' | 'pink' | 'red' | null.

ALTER TABLE "Card"
  ADD COLUMN IF NOT EXISTS "flagColor" TEXT,
  ADD COLUMN IF NOT EXISTS "flagAt"    TIMESTAMP(3);
