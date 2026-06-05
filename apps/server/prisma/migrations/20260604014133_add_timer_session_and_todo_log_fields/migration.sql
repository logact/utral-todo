-- AlterTable
ALTER TABLE "TodoLog" ADD COLUMN "metadata" JSONB;
ALTER TABLE "TodoLog" ADD COLUMN "minutesSpent" INTEGER;

-- CreateTable
CREATE TABLE "TimerSession" (
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
    "updatedAt" DATETIME NOT NULL
);
