import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled'),
  description: text('description').notNull().default(''),
  nodeType: text('node_type', { enum: ['goal', 'task'] }).notNull().default('task'),
  status: text('status', { enum: ['pending', 'in_progress', 'done'] }).notNull().default('pending'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  goalStatus: text('goal_status', { enum: ['active', 'paused', 'achieved', 'abandoned'] }),
  estimatedMinutes: integer('estimated_minutes').notNull().default(0),
  scheduledDate: text('scheduled_date'),
  dueDate: text('due_date'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  order: integer('order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const pluses = sqliteTable('pluses', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Untitled Pluse'),
  description: text('description').notNull().default(''),
  intervals: text('intervals', { mode: 'json' }).$type<number[]>().notNull().default([1500]),
  repeatCount: integer('repeat_count').notNull().default(1),
  autoAdvance: integer('auto_advance', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const timerSessions = sqliteTable('timer_sessions', {
  id: text('id').primaryKey(),
  pluseId: text('pluse_id'),
  todoId: text('todo_id'),
  name: text('name').notNull().default(''),
  intervals: text('intervals', { mode: 'json' }).$type<number[]>().notNull().default([]),
  repeatCount: integer('repeat_count').notNull().default(1),
  currentIndex: integer('current_index').notNull().default(0),
  elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
  status: text('status', { enum: ['running', 'paused', 'completed'] }).notNull().default('running'),
  startedAt: text('started_at').notNull(),
  pausedAt: text('paused_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const syncConfig = sqliteTable('sync_config', {
  id: text('id').primaryKey().default('default'),
  serverUrl: text('server_url').notNull().default(''),
  apiToken: text('api_token'),
});

export const hlcState = sqliteTable('hlc_state', {
  id: text('id').primaryKey().default('default'),
  counter: integer('counter').notNull().default(0),
  node: text('node').notNull(),
  lastSeen: integer('last_seen').notNull(),
});
