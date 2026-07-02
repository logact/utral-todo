DROP INDEX "SyncEvent_seq_idx";--> statement-breakpoint
ALTER TABLE "SyncEvent" ADD COLUMN "channel" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "SyncEvent_channel_seq_idx" ON "SyncEvent" USING btree ("channel","seq");