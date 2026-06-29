CREATE TABLE `action_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`from_todo_id` text NOT NULL,
	`to_todo_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `action_edges_from_idx` ON `action_edges` (`from_todo_id`);--> statement-breakpoint
CREATE INDEX `action_edges_to_idx` ON `action_edges` (`to_todo_id`);--> statement-breakpoint
CREATE INDEX `action_edges_type_idx` ON `action_edges` (`type`);--> statement-breakpoint
CREATE INDEX `action_edges_created_at_idx` ON `action_edges` (`created_at_wall`);--> statement-breakpoint
CREATE INDEX `action_edges_updated_at_idx` ON `action_edges` (`updated_at_wall`);--> statement-breakpoint
CREATE TABLE `hlc_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_todo_id` text NOT NULL,
	`title` text DEFAULT 'Untitled Plan' NOT NULL,
	`node_ids` text DEFAULT '[]' NOT NULL,
	`edge_ids` text DEFAULT '[]' NOT NULL,
	`is_system_plan` integer,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_goal_todo_id_idx` ON `plans` (`goal_todo_id`);--> statement-breakpoint
CREATE INDEX `plans_updated_at_idx` ON `plans` (`updated_at_wall`);--> statement-breakpoint
CREATE TABLE `pluses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Untitled Pluse' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`intervals` text DEFAULT '[1500]' NOT NULL,
	`repeat_count` integer DEFAULT 1 NOT NULL,
	`interval_todos` text,
	`auto_advance` integer DEFAULT true NOT NULL,
	`timer_status` text DEFAULT 'idle' NOT NULL,
	`current_interval_index` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`accumulated_seconds` integer DEFAULT 0 NOT NULL,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pluses_created_at_idx` ON `pluses` (`created_at_wall`);--> statement-breakpoint
CREATE INDEX `pluses_updated_at_idx` ON `pluses` (`updated_at_wall`);--> statement-breakpoint
CREATE INDEX `pluses_timer_status_idx` ON `pluses` (`timer_status`);--> statement-breakpoint
CREATE TABLE `repeat_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`date` integer NOT NULL,
	`status` text,
	`completed_at` integer,
	`materialized_todo_id` text,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repeat_occurrences_template_id_idx` ON `repeat_occurrences` (`template_id`);--> statement-breakpoint
CREATE INDEX `repeat_occurrences_date_idx` ON `repeat_occurrences` (`date`);--> statement-breakpoint
CREATE TABLE `sync_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`operation` text NOT NULL,
	`record_id` text NOT NULL,
	`payload` text,
	`created_at` text NOT NULL,
	`retry_count` integer DEFAULT 0,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `timer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`pluse_id` text,
	`todo_id` text,
	`intervals` text,
	`repeat_count` integer,
	`current_index` integer DEFAULT 0 NOT NULL,
	`elapsed_seconds` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer,
	`paused_at` integer,
	`completed_at` integer,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `timer_sessions_type_idx` ON `timer_sessions` (`type`);--> statement-breakpoint
CREATE INDEX `timer_sessions_status_idx` ON `timer_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `timer_sessions_pluse_id_idx` ON `timer_sessions` (`pluse_id`);--> statement-breakpoint
CREATE TABLE `todo_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`minutes_spent` integer,
	`metadata` text,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `todo_logs_todo_id_idx` ON `todo_logs` (`todo_id`);--> statement-breakpoint
CREATE INDEX `todo_logs_type_idx` ON `todo_logs` (`type`);--> statement-breakpoint
CREATE INDEX `todo_logs_created_at_idx` ON `todo_logs` (`created_at_wall`);--> statement-breakpoint
CREATE INDEX `todo_logs_updated_at_idx` ON `todo_logs` (`updated_at_wall`);--> statement-breakpoint
CREATE TABLE `todo_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`from_todo_id` text NOT NULL,
	`to_todo_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at_wall` integer,
	`created_at_counter` integer DEFAULT 0 NOT NULL,
	`created_at_node` text,
	`updated_at_wall` integer,
	`updated_at_counter` integer DEFAULT 0 NOT NULL,
	`updated_at_node` text,
	`is_deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `todo_relations_from_idx` ON `todo_relations` (`from_todo_id`);--> statement-breakpoint
CREATE INDEX `todo_relations_to_idx` ON `todo_relations` (`to_todo_id`);--> statement-breakpoint
CREATE INDEX `todo_relations_type_idx` ON `todo_relations` (`type`);--> statement-breakpoint
CREATE INDEX `todo_relations_created_at_idx` ON `todo_relations` (`created_at_wall`);--> statement-breakpoint
CREATE INDEX `todo_relations_updated_at_idx` ON `todo_relations` (`updated_at_wall`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`node_type` text DEFAULT 'task' NOT NULL,
	`pattern` text,
	`title` text DEFAULT 'Untitled' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`goal_status` text,
	`estimated_minutes` integer DEFAULT 60 NOT NULL,
	`scheduled_date` integer,
	`scheduled_end_date` integer,
	`due_date` integer,
	`started_at` integer,
	`completed_at` integer,
	`parent_id` text,
	`active_plan_id` text,
	`is_root_goal` integer,
	`is_system_task` integer,
	`motivation` text,
	`success_criteria` text,
	`target_date` integer,
	`repeat_rule` text,
	`tags` text DEFAULT '[]' NOT NULL,
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
CREATE INDEX `todos_node_type_idx` ON `todos` (`node_type`);--> statement-breakpoint
CREATE INDEX `todos_pattern_idx` ON `todos` (`pattern`);--> statement-breakpoint
CREATE INDEX `todos_parent_id_idx` ON `todos` (`parent_id`);--> statement-breakpoint
CREATE INDEX `todos_status_idx` ON `todos` (`status`);--> statement-breakpoint
CREATE INDEX `todos_scheduled_date_idx` ON `todos` (`scheduled_date`);--> statement-breakpoint
CREATE INDEX `todos_due_date_idx` ON `todos` (`due_date`);--> statement-breakpoint
CREATE INDEX `todos_created_at_idx` ON `todos` (`created_at_wall`);--> statement-breakpoint
CREATE INDEX `todos_updated_at_idx` ON `todos` (`updated_at_wall`);--> statement-breakpoint
CREATE INDEX `todos_order_idx` ON `todos` (`order`);--> statement-breakpoint
CREATE INDEX `todos_started_at_idx` ON `todos` (`started_at`);--> statement-breakpoint
CREATE INDEX `todos_status_scheduled_idx` ON `todos` (`status`,`scheduled_date`);