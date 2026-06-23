/*
  Warnings:

  - You are about to alter the column `deletedAtWall` on the `ActionEdge` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `ActionEdge` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `Plan` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `Plan` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `Pluse` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `Pluse` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `RepeatOccurrence` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `RepeatOccurrence` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `SyncEvent` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `TimerSession` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `TimerSession` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `Todo` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `Todo` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `TodoLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `TodoLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `deletedAtWall` on the `TodoRelation` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `versionWall` on the `TodoRelation` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActionEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTodoId" TEXT NOT NULL,
    "toTodoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT
);
INSERT INTO "new_ActionEdge" ("createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "fromTodoId", "id", "toTodoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "fromTodoId", "id", "toTodoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "ActionEdge";
DROP TABLE "ActionEdge";
ALTER TABLE "new_ActionEdge" RENAME TO "ActionEdge";
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalTodoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "nodeIds" JSONB NOT NULL,
    "edgeIds" JSONB NOT NULL,
    "isSystemPlan" BOOLEAN DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT
);
INSERT INTO "new_Plan" ("createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "edgeIds", "goalTodoId", "id", "isSystemPlan", "nodeIds", "title", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "edgeIds", "goalTodoId", "id", "isSystemPlan", "nodeIds", "title", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_goalTodoId_idx" ON "Plan"("goalTodoId");
CREATE TABLE "new_Pluse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "intervals" JSONB NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "intervalTodos" JSONB,
    "autoAdvance" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT
);
INSERT INTO "new_Pluse" ("autoAdvance", "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "description", "id", "intervalTodos", "intervals", "name", "repeatCount", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "autoAdvance", "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "description", "id", "intervalTodos", "intervals", "name", "repeatCount", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "Pluse";
DROP TABLE "Pluse";
ALTER TABLE "new_Pluse" RENAME TO "Pluse";
CREATE TABLE "new_RepeatOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "completedAt" DATETIME,
    "materializedTodoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT
);
INSERT INTO "new_RepeatOccurrence" ("completedAt", "createdAt", "date", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "id", "materializedTodoId", "status", "templateId", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "completedAt", "createdAt", "date", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "id", "materializedTodoId", "status", "templateId", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "RepeatOccurrence";
DROP TABLE "RepeatOccurrence";
ALTER TABLE "new_RepeatOccurrence" RENAME TO "RepeatOccurrence";
CREATE INDEX "RepeatOccurrence_templateId_idx" ON "RepeatOccurrence"("templateId");
CREATE INDEX "RepeatOccurrence_date_idx" ON "RepeatOccurrence"("date");
CREATE TABLE "new_SyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "table" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "payload" JSONB,
    "deviceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_SyncEvent" ("createdAt", "deviceId", "id", "operation", "payload", "recordId", "table", "versionCounter", "versionNode", "versionWall") SELECT "createdAt", "deviceId", "id", "operation", "payload", "recordId", "table", "versionCounter", "versionNode", "versionWall" FROM "SyncEvent";
DROP TABLE "SyncEvent";
ALTER TABLE "new_SyncEvent" RENAME TO "SyncEvent";
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");
CREATE INDEX "SyncEvent_recordId_idx" ON "SyncEvent"("recordId");
CREATE TABLE "new_TimerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pluseId" TEXT,
    "todoId" TEXT,
    "intervals" JSONB,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" DATETIME,
    "completedAt" DATETIME,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT
);
INSERT INTO "new_TimerSession" ("completedAt", "createdAt", "currentIndex", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "elapsedSeconds", "id", "intervals", "name", "pausedAt", "pluseId", "repeatCount", "startedAt", "status", "todoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "completedAt", "createdAt", "currentIndex", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "elapsedSeconds", "id", "intervals", "name", "pausedAt", "pluseId", "repeatCount", "startedAt", "status", "todoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "TimerSession";
DROP TABLE "TimerSession";
ALTER TABLE "new_TimerSession" RENAME TO "TimerSession";
CREATE TABLE "new_Todo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeType" TEXT NOT NULL DEFAULT 'task',
    "pattern" TEXT NOT NULL DEFAULT 'task',
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT,
    "priority" TEXT,
    "estimatedMinutes" INTEGER,
    "tags" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "scheduledDate" DATETIME,
    "scheduledEndDate" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "repeatRule" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "motivation" TEXT,
    "successCriteria" TEXT,
    "targetDate" DATETIME,
    "goalStatus" TEXT,
    "activePlanId" TEXT,
    "isRootGoal" BOOLEAN DEFAULT false,
    "isSystemTask" BOOLEAN DEFAULT false,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT,
    CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Todo" ("activePlanId", "completedAt", "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "description", "dueDate", "estimatedMinutes", "goalStatus", "id", "isRootGoal", "isSystemTask", "motivation", "nodeType", "order", "parentId", "pattern", "priority", "repeatRule", "scheduledDate", "scheduledEndDate", "startedAt", "status", "successCriteria", "tags", "targetDate", "title", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "activePlanId", "completedAt", "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "description", "dueDate", "estimatedMinutes", "goalStatus", "id", "isRootGoal", "isSystemTask", "motivation", "nodeType", "order", "parentId", "pattern", "priority", "repeatRule", "scheduledDate", "scheduledEndDate", "startedAt", "status", "successCriteria", "tags", "targetDate", "title", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "Todo";
DROP TABLE "Todo";
ALTER TABLE "new_Todo" RENAME TO "Todo";
CREATE TABLE "new_TodoLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "todoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "minutesSpent" INTEGER,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT,
    CONSTRAINT "TodoLog_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TodoLog" ("content", "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "id", "metadata", "minutesSpent", "todoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "content", "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "id", "metadata", "minutesSpent", "todoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "TodoLog";
DROP TABLE "TodoLog";
ALTER TABLE "new_TodoLog" RENAME TO "TodoLog";
CREATE TABLE "new_TodoRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTodoId" TEXT NOT NULL,
    "toTodoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "versionWall" BIGINT NOT NULL DEFAULT 0,
    "versionCounter" INTEGER NOT NULL DEFAULT 0,
    "versionNode" TEXT NOT NULL DEFAULT '',
    "deletedAtWall" BIGINT,
    "deletedAtCounter" INTEGER,
    "deletedAtNode" TEXT,
    CONSTRAINT "TodoRelation_fromTodoId_fkey" FOREIGN KEY ("fromTodoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TodoRelation_toTodoId_fkey" FOREIGN KEY ("toTodoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TodoRelation" ("createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "fromTodoId", "id", "toTodoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall") SELECT "createdAt", "deletedAtCounter", "deletedAtNode", "deletedAtWall", "fromTodoId", "id", "toTodoId", "type", "updatedAt", "versionCounter", "versionNode", "versionWall" FROM "TodoRelation";
DROP TABLE "TodoRelation";
ALTER TABLE "new_TodoRelation" RENAME TO "TodoRelation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
