-- Visão Gerencial — Kanban virtual (colunas que agregam listas de quadros
-- diferentes). Ver tarefas-md/visao-gerencial-kanban.md.

-- CreateTable
CREATE TABLE "ManagementBoard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Visão Kanban',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementColumn" (
    "id" TEXT NOT NULL,
    "managementBoardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementColumnSource" (
    "id" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "ManagementColumnSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagementBoard_organizationId_idx" ON "ManagementBoard"("organizationId");

-- CreateIndex
CREATE INDEX "ManagementColumn_managementBoardId_position_idx" ON "ManagementColumn"("managementBoardId", "position");

-- CreateIndex
CREATE INDEX "ManagementColumnSource_columnId_idx" ON "ManagementColumnSource"("columnId");

-- CreateIndex
CREATE INDEX "ManagementColumnSource_listId_idx" ON "ManagementColumnSource"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementColumnSource_columnId_boardId_listId_key" ON "ManagementColumnSource"("columnId", "boardId", "listId");

-- AddForeignKey
ALTER TABLE "ManagementBoard" ADD CONSTRAINT "ManagementBoard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementColumn" ADD CONSTRAINT "ManagementColumn_managementBoardId_fkey" FOREIGN KEY ("managementBoardId") REFERENCES "ManagementBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementColumnSource" ADD CONSTRAINT "ManagementColumnSource_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ManagementColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementColumnSource" ADD CONSTRAINT "ManagementColumnSource_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementColumnSource" ADD CONSTRAINT "ManagementColumnSource_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
