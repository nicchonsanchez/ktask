-- CreateTable
CREATE TABLE "WhatsappOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'standard',
    "payload" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "batchId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappOutbox_sentAt_scheduledFor_idx" ON "WhatsappOutbox"("sentAt", "scheduledFor");

-- CreateIndex
CREATE INDEX "WhatsappOutbox_userId_sentAt_idx" ON "WhatsappOutbox"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "WhatsappOutbox_organizationId_sentAt_idx" ON "WhatsappOutbox"("organizationId", "sentAt");

-- AddForeignKey
ALTER TABLE "WhatsappOutbox" ADD CONSTRAINT "WhatsappOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappOutbox" ADD CONSTRAINT "WhatsappOutbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
