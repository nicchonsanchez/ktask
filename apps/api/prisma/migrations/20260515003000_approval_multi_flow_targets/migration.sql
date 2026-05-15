-- Suporte multi-fluxo na aprovacao: targets {boardId, listId}[] em JSON
-- substitui o defaultOn{Approve,Reject}ListId (1 lista, board principal).
-- Legacy fica preservado pra compat com pedidos antigos.

ALTER TABLE "CardApproval"
  ADD COLUMN "defaultOnApproveTargets" JSONB,
  ADD COLUMN "defaultOnRejectTargets"  JSONB;
