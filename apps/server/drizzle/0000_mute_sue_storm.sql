CREATE TABLE "ActionEdge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fromTodoId" text NOT NULL,
	"toTodoId" text NOT NULL,
	"type" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deviceId" text NOT NULL,
	"platform" text NOT NULL,
	"name" text,
	"pushToken" text,
	"appVersion" text,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goalTodoId" text NOT NULL,
	"title" text NOT NULL,
	"nodeIds" jsonb NOT NULL,
	"edgeIds" jsonb NOT NULL,
	"isSystemPlan" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Pluse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"intervals" jsonb NOT NULL,
	"repeatCount" integer DEFAULT 1 NOT NULL,
	"intervalTodos" jsonb,
	"autoAdvance" boolean DEFAULT true NOT NULL,
	"timerStatus" text DEFAULT 'idle' NOT NULL,
	"currentIntervalIndex" integer DEFAULT 0 NOT NULL,
	"startedAt" timestamp,
	"accumulatedSeconds" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RepeatOccurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"templateId" text NOT NULL,
	"date" timestamp NOT NULL,
	"status" text NOT NULL,
	"completedAt" timestamp,
	"materializedTodoId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SyncEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table" text NOT NULL,
	"operation" text NOT NULL,
	"recordId" text NOT NULL,
	"payload" jsonb,
	"deviceId" text NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TimeSlot" (
	"id" text PRIMARY KEY NOT NULL,
	"milestoneId" text NOT NULL,
	"title" text NOT NULL,
	"time" text NOT NULL,
	"startHour" integer NOT NULL,
	"startMinute" integer NOT NULL,
	"endHour" integer NOT NULL,
	"endMinute" integer NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Todo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nodeType" text DEFAULT 'task' NOT NULL,
	"pattern" text DEFAULT 'task' NOT NULL,
	"parentId" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text,
	"priority" text,
	"estimatedMinutes" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"dueDate" timestamp,
	"scheduledDate" timestamp,
	"scheduledEndDate" timestamp,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"repeatRule" jsonb,
	"order" integer DEFAULT 0 NOT NULL,
	"motivation" text,
	"successCriteria" text,
	"targetDate" timestamp,
	"goalStatus" text,
	"activePlanId" text,
	"isRootGoal" boolean DEFAULT false,
	"isSystemTask" boolean DEFAULT false,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TodoLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todoId" uuid NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"minutesSpent" integer,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TodoRelation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fromTodoId" uuid NOT NULL,
	"toTodoId" uuid NOT NULL,
	"type" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"versionWall" bigint DEFAULT 0 NOT NULL,
	"versionCounter" integer DEFAULT 0 NOT NULL,
	"versionNode" text DEFAULT '' NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device" USING btree ("deviceId");--> statement-breakpoint
CREATE INDEX "Device_platform_idx" ON "Device" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "Device_pushToken_idx" ON "Device" USING btree ("pushToken");--> statement-breakpoint
CREATE INDEX "Plan_goalTodoId_idx" ON "Plan" USING btree ("goalTodoId");--> statement-breakpoint
CREATE INDEX "RepeatOccurrence_templateId_idx" ON "RepeatOccurrence" USING btree ("templateId");--> statement-breakpoint
CREATE INDEX "RepeatOccurrence_date_idx" ON "RepeatOccurrence" USING btree ("date");--> statement-breakpoint
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "SyncEvent_recordId_idx" ON "SyncEvent" USING btree ("recordId");--> statement-breakpoint
CREATE INDEX "SyncEvent_seq_idx" ON "SyncEvent" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "TimeSlot_milestoneId_idx" ON "TimeSlot" USING btree ("milestoneId");