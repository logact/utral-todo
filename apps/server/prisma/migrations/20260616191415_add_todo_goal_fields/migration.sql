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
    "projectId" TEXT,
    "instructions" TEXT NOT NULL DEFAULT '',
    "isGoal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Todo" (
    "id", "nodeType", "pattern", "parentId", "title", "description",
    "status", "priority", "estimatedMinutes", "tags", "createdAt", "updatedAt",
    "dueDate", "scheduledDate", "scheduledEndDate", "startedAt", "completedAt",
    "repeatRule", "order", "motivation", "successCriteria", "targetDate",
    "goalStatus", "activePlanId", "isRootGoal", "projectId", "instructions", "isGoal"
) SELECT
    "id", 'task', 'task', "parentId", "title", "description",
    "status", "priority", "estimatedMinutes", "tags", "createdAt", "updatedAt",
    "dueDate", "scheduledDate", "scheduledEndDate", "startedAt", "completedAt",
    "repeatRule", "order", NULL, NULL, NULL,
    NULL, NULL, false, "projectId", "instructions", "isGoal"
FROM "Todo";

DROP TABLE "Todo";
ALTER TABLE "new_Todo" RENAME TO "Todo";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
