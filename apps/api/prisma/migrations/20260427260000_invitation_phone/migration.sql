-- Doc 35: telefone opcional no convite pra disparo via WhatsApp em paralelo ao email.
ALTER TABLE "Invitation" ADD COLUMN "phone" TEXT;
