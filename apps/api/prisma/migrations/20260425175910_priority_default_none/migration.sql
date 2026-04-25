-- Muda o default da coluna Card.priority de MEDIUM para NONE. Cards
-- existentes não são afetados (mantêm seus valores atuais); só novos
-- inserts sem priority explícito passam a iniciar como NONE.

ALTER TABLE "Card" ALTER COLUMN "priority" SET DEFAULT 'NONE';
