/*
  Warnings:

  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `instructions` on the `Todo` table. All the data in the column will be lost.
  - You are about to drop the column `isGoal` on the `Todo` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Todo` table. All the data in the column will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Project";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Todo" ("activePlanId", "completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "goalStatus", "id", "isRootGoal", "isSystemTask", "motivation", "nodeType", "order", "parentId", "pattern", "priority", "repeatRule", "scheduledDate", "scheduledEndDate", "startedAt", "status", "successCriteria", "tags", "targetDate", "title", "updatedAt") SELECT "activePlanId", "completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "goalStatus", "id", "isRootGoal", "isSystemTask", "motivation", "nodeType", "order", "parentId", "pattern", "priority", "repeatRule", "scheduledDate", "scheduledEndDate", "startedAt", "status", "successCriteria", "tags", "targetDate", "title", "updatedAt" FROM "Todo";
DROP TABLE "Todo";
ALTER TABLE "new_Todo" RENAME TO "Todo";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
