-- Cria infraestrutura de automações: enums + tabelas Automation + AutomationRun.
-- Engine real (dispatcher, handlers, anti-loop) entra em commit posterior.

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM (
  'CARD_ENTERED',
  'CARD_LEFT',
  'TIME_IN_LIST',
  'TIME_NO_INTERACTION',
  'DUE_DATE_TODAY',
  'DUE_DATE_OVERDUE'
);

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM (
  'INSERT_TAGS',
  'REMOVE_TAGS',
  'INSERT_CHECKLIST_ITEMS',
  'INSERT_CHECKLIST_GROUP',
  'SET_CARD_STATUS',
  'FILL_FIELDS',
  'SAVE_DESCRIPTION_VERSION',
  'SET_LEAD',
  'ADD_TEAM',
  'POST_COMMENT',
  'CREATE_CHILD_CARD',
  'SEND_EMAIL',
  'SEND_WHATSAPP',
  'LINK_FLOW',
  'UNLINK_FLOW',
  'UPDATE_FLOW_POSITION',
  'FLAG_DUE_TODAY',
  'FLAG_OVERDUE'
);

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'SKIPPED'
);

-- CreateTable Automation
CREATE TABLE "Automation" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "listId"         TEXT,
  "boardId"        TEXT,
  "trigger"        "AutomationTrigger" NOT NULL,
  "triggerConfig"  JSONB NOT NULL DEFAULT '{}'::jsonb,
  "actionType"     "AutomationActionType" NOT NULL,
  "actionConfig"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "label"          TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable AutomationRun
CREATE TABLE "AutomationRun" (
  "id"           TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "cardId"       TEXT,
  "status"       "AutomationRunStatus" NOT NULL DEFAULT 'PENDING',
  "chainDepth"   INTEGER NOT NULL DEFAULT 0,
  "error"        TEXT,
  "result"       JSONB,
  "startedAt"    TIMESTAMP(3),
  "finishedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- Indexes Automation
CREATE INDEX "Automation_organizationId_idx" ON "Automation" ("organizationId");
CREATE INDEX "Automation_listId_isActive_idx" ON "Automation" ("listId", "isActive");
CREATE INDEX "Automation_boardId_isActive_idx" ON "Automation" ("boardId", "isActive");

-- Indexes AutomationRun
CREATE INDEX "AutomationRun_automationId_createdAt_idx"
  ON "AutomationRun" ("automationId", "createdAt");
CREATE INDEX "AutomationRun_cardId_idx" ON "AutomationRun" ("cardId");

-- Foreign keys Automation
ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "List"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Foreign keys AutomationRun
ALTER TABLE "AutomationRun"
  ADD CONSTRAINT "AutomationRun_automationId_fkey"
  FOREIGN KEY ("automationId") REFERENCES "Automation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationRun"
  ADD CONSTRAINT "AutomationRun_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
