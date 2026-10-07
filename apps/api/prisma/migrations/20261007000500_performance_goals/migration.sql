-- Doc 52 (Fase 4, D10): metas configuraveis. 100% aditivo: 2 tabelas novas.

-- CreateTable
CREATE TABLE "PerformanceGoal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PerformanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGoalTarget" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceGoalTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceGoal_organizationId_isActive_idx" ON "PerformanceGoal"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "PerformanceGoalTarget_goalId_effectiveFrom_idx" ON "PerformanceGoalTarget"("goalId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoalTarget" ADD CONSTRAINT "PerformanceGoalTarget_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PerformanceGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

