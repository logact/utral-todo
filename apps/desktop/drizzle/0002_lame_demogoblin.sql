CREATE TABLE `time_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`start_hour` integer DEFAULT 0 NOT NULL,
	`start_minute` integer DEFAULT 0 NOT NULL,
	`end_hour` integer DEFAULT 0 NOT NULL,
	`end_minute` integer DEFAULT 0 NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_slots_milestone_id_idx` ON `time_slots` (`milestone_id`);--> statement-breakpoint
CREATE INDEX `time_slots_order_idx` ON `time_slots` (`order`);--> statement-breakpoint
CREATE INDEX `time_slots_updated_at_idx` ON `time_slots` (`updated_at_wall`);