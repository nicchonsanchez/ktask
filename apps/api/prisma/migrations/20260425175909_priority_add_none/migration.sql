-- Adiciona o valor NONE no enum Priority para representar "sem prioridade
-- definida". Postgres exige que o novo valor seja committed antes de ser
-- referenciado num DEFAULT, por isso o SET DEFAULT vive na próxima migration.

ALTER TYPE "Priority" ADD VALUE IF NOT EXISTS 'NONE';
