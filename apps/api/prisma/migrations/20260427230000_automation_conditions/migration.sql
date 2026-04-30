-- Configuração condicional opcional na Automation. Array de
-- AutomationCondition (Tags / Prioridade / Líder / Prazo) com AND entre
-- todas. Null = automação sempre roda quando o trigger dispara.

ALTER TABLE "Automation" ADD COLUMN "conditions" JSONB;
