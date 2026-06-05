-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalTodoId" TEXT NOT NULL,
    "phases" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActionEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromTodoId" TEXT NOT NULL,
    "toTodoId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Pluse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "intervals" JSONB NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Todo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Todo" ("completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "id", "parentId", "priority", "projectId", "repeatRule", "scheduledDate", "status", "tags", "title") SELECT "completedAt", "createdAt", "description", "dueDate", "estimatedMinutes", "id", "parentId", "priority", "projectId", "repeatRule", "scheduledDate", "status", "tags", "title" FROM "Todo";
DROP TABLE "Todo";
ALTER TABLE "new_Todo" RENAME TO "Todo";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_goalTodoId_key" ON "Roadmap"("goalTodoId");
