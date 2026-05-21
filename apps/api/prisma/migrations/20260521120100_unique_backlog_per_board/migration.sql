-- Garante que cada board tenha exatamente 1 coluna backlog ATIVA.
-- Espelha o padrao de List_boardId_isFinalList_unique (migration
-- 20260508120000_unique_final_list_per_board) — partial unique index.
--
-- Regra de negocio (doc 42): cada board precisa de uma coluna backlog
-- pra cards entrarem por padrao. O service ja enforcer via
-- lists.service.ts::ensureBacklogList(); isso aqui e cinto-e-suspensorio
-- pra capturar:
--   - Bypass via SQL direto / seeds antigos
--   - Rollback parcial de migration
--   - Race condition em arquivamento concorrente
--
-- O index NAO cobre o caso "zero backlogs" (Postgres unique nao consegue
-- exigir existencia). Service continua sendo o guardiao desse caso.
--
-- Auditoria de 2026-05-21 confirmou 0 boards com multiplos backlogs
-- ativos em prod, entao nao precisa de UPDATE de normalizacao antes
-- do CREATE INDEX.

CREATE UNIQUE INDEX "List_boardId_isBacklog_active_unique"
  ON "List"("boardId")
  WHERE "isBacklog" = true AND "isArchived" = false;
