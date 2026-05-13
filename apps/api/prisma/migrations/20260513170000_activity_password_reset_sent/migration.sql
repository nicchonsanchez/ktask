-- ActivityType ganhou variante "MEMBER_PASSWORD_RESET_SENT" pra diferenciar
-- "envio de link (sem deslogar)" do "forçar redefinição (invalida sessões)".
-- Caminho de atendimento vs incidente.

ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MEMBER_PASSWORD_RESET_SENT';
