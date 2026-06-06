/*
  Warnings:

  - Added the required column `updatedAt` to the `ActionEdge` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Pluse` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Todo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `TodoLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `TodoRelation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "table" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "payload" JSONB,
    "deviceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActionEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTodoId" TEXT NOT NULL,
    "toTodoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ActionEdge" ("createdAt", "fromTodoId", "id", "toTodoId", "type", "updatedAt") SELECT "createdAt", "fromTodoId", "id", "toTodoId", "type", "createdAt" FROM "ActionEdge";
DROP TABLE "ActionEdge";
ALTER TABLE "new_ActionEdge" RENAME TO "ActionEdge";
CREATE TABLE "new_Pluse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "intervals" JSONB NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Pluse" ("createdAt", "description", "id", "intervals", "name", "repeatCount", "updatedAt") SELECT "createdAt", "description", "id", "intervals", "name", "repeatCount", "createdAt" FROM "Pluse";
DROP TABLE "Pluse";
ALTER TABLE "new_Pluse" RENAME TO "Pluse";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deadline" DATETIME
);
INSERT INTO "new_Project" ("color", "createdAt", "deadline", "description", "id", "status", "title", "updatedAt") SELECT "color", "createdAt", "deadline", "description", "id", "status", "title", "createdAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_Todo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 60,
    "tags" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "scheduledDate" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "repeatRule" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isGoal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Todo" ("completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "id", "instructions", "isGoal", "order", "parentId", "priority", "projectId", "repeatRule", "scheduledDate", "startedAt", "status", "tags", "title", "updatedAt") SELECT "completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "id", "instructions", "isGoal", "order", "parentId", "priority", "projectId", "repeatRule", "scheduledDate", "startedAt", "status", "tags", "title", "createdAt" FROM "Todo";
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
    CONSTRAINT "TodoLog_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TodoLog" ("content", "createdAt", "id", "metadata", "minutesSpent", "todoId", "type", "updatedAt") SELECT "content", "createdAt", "id", "metadata", "minutesSpent", "todoId", "type", "createdAt" FROM "TodoLog";
DROP TABLE "TodoLog";
ALTER TABLE "new_TodoLog" RENAME TO "TodoLog";
CREATE TABLE "new_TodoRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTodoId" TEXT NOT NULL,
    "toTodoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TodoRelation_fromTodoId_fkey" FOREIGN KEY ("fromTodoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TodoRelation_toTodoId_fkey" FOREIGN KEY ("toTodoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TodoRelation" ("createdAt", "fromTodoId", "id", "toTodoId", "type", "updatedAt") SELECT "createdAt", "fromTodoId", "id", "toTodoId", "type", "createdAt" FROM "TodoRelation";
DROP TABLE "TodoRelation";
ALTER TABLE "new_TodoRelation" RENAME TO "TodoRelation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SyncEvent_recordId_idx" ON "SyncEvent"("recordId");
