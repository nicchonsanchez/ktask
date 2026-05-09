-- Doc: cor decorativa de card substitui prioridade.
-- ChecklistItem.priority continua existindo (tem ordenacao real
-- na home pessoal). Card.priority some — cor decorativa toma o lugar
-- como categorizacao visual livre.

ALTER TABLE "Card" ADD COLUMN "cardColor" TEXT;
ALTER TABLE "Card" DROP COLUMN "priority";
