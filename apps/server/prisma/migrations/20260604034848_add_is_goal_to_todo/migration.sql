-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "dueDate" DATETIME,
    "scheduledDate" DATETIME,
    "completedAt" DATETIME,
    "repeatRule" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isGoal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Todo" ("completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "id", "instructions", "order", "parentId", "priority", "projectId", "repeatRule", "scheduledDate", "status", "tags", "title") SELECT "completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "id", "instructions", "order", "parentId", "priority", "projectId", "repeatRule", "scheduledDate", "status", "tags", "title" FROM "Todo";
DROP TABLE "Todo";
ALTER TABLE "new_Todo" RENAME TO "Todo";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
