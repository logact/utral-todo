-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalTodoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "nodeIds" JSONB NOT NULL,
    "edgeIds" JSONB NOT NULL,
    "isSystemPlan" BOOLEAN DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepeatOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "completedAt" DATETIME,
    "materializedTodoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT,
    "pushToken" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Plan_goalTodoId_idx" ON "Plan"("goalTodoId");

-- CreateIndex
CREATE INDEX "RepeatOccurrence_templateId_idx" ON "RepeatOccurrence"("templateId");

-- CreateIndex
CREATE INDEX "RepeatOccurrence_date_idx" ON "RepeatOccurrence"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");

-- CreateIndex
CREATE INDEX "Device_platform_idx" ON "Device"("platform");

-- CreateIndex
CREATE INDEX "Device_pushToken_idx" ON "Device"("pushToken");
