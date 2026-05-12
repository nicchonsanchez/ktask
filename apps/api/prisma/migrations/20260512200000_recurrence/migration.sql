-- Doc 49: recorrencia em tarefas (ChecklistItem + Task standalone).
-- Campo JSONB opcional. Shape esperado:
--   { freq: 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY',
--     interval: number,           -- ex: a cada 2 semanas → interval=2 freq='WEEKLY'
--     weekdays?: number[]         -- 0=Dom..6=Sab; so usado quando freq=WEEKLY
--     endsAt?: string }           -- ISO date, opcional, fim da recorrencia
-- null = item nao-recorrente (comportamento atual). Sem migracao de dado.

ALTER TABLE "ChecklistItem" ADD COLUMN "recurrence" JSONB;
ALTER TABLE "Task"          ADD COLUMN "recurrence" JSONB;
