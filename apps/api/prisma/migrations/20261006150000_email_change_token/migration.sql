-- Doc 53 (Confirmacao de troca de email): 100% aditivo.
-- Novos valores de enum + nova tabela. Nenhum dado existente e alterado.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'MEMBER_EMAIL_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE 'MEMBER_EMAIL_CHANGE_CANCELLED';

-- CreateTable
CREATE TABLE "EmailChangeToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE INDEX "EmailChangeToken_userId_createdAt_idx" ON "EmailChangeToken"("userId", "createdAt");
CREATE INDEX "EmailChangeToken_expiresAt_idx" ON "EmailChangeToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "EmailChangeToken" ADD CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
