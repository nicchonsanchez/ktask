-- AlterTable: Card.version (optimistic concurrency).
-- Incrementa a cada update de campos editaveis (title, description, etc).
-- Frontend envia ifVersion no PATCH e backend rejeita com 409 quando difere,
-- evitando lost-update entre 2 usuarios editando o mesmo card.
ALTER TABLE "Card" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
