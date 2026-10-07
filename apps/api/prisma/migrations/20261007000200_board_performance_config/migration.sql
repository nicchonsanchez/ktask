-- Doc 52 (Desempenho da Equipe): configuracao gerencial por fluxo.
-- 100% aditivo: 2 tabelas novas. Nao altera Board/List/Card — a
-- configuracao so interpreta eventos pro relatorio.

-- CreateTable
CREATE TABLE "BoardPerformanceConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "area" TEXT,
    "contactLoggingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardPerformanceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardPerformanceConfigVersion" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "columns" JSONB NOT NULL,
    "transitionOverrides" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardPerformanceConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardPerformanceConfig_boardId_key" ON "BoardPerformanceConfig"("boardId");

-- CreateIndex
CREATE INDEX "BoardPerformanceConfig_organizationId_area_idx" ON "BoardPerformanceConfig"("organizationId", "area");

-- CreateIndex
CREATE INDEX "BoardPerformanceConfigVersion_boardId_effectiveFrom_idx" ON "BoardPerformanceConfigVersion"("boardId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "BoardPerformanceConfigVersion_configId_effectiveFrom_idx" ON "BoardPerformanceConfigVersion"("configId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "BoardPerformanceConfig" ADD CONSTRAINT "BoardPerformanceConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardPerformanceConfig" ADD CONSTRAINT "BoardPerformanceConfig_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardPerformanceConfigVersion" ADD CONSTRAINT "BoardPerformanceConfigVersion_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BoardPerformanceConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardPerformanceConfigVersion" ADD CONSTRAINT "BoardPerformanceConfigVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
