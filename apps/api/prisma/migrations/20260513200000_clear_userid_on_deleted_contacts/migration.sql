-- Backfill: limpa userId em contatos ja soft-deletados antes do fix em
-- ContactsService.remove(). Sem isso, User.linkedContact continua apontando
-- pro contato morto e bloqueia criacao de novo Contact pro mesmo User com
-- "ja tem outro contato vinculado".
UPDATE "Contact"
SET "userId" = NULL
WHERE "deletedAt" IS NOT NULL
  AND "userId" IS NOT NULL;
