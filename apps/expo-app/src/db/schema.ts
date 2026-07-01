import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────────────────────
// Domain tables are shared with the desktop app via @utral/db-schema (single
// source of truth for the entity model, incl. the `isDeleted` soft-delete
// column). Only the mobile-specific sync/infra tables are declared locally.
// ─────────────────────────────────────────────────────────────────────────────

export {
  todos,
  todoRelations,
  todoLogs,
  actionEdges,
  plans,
  pluses,
  repeatOccurrences,
  timeSlots,
} from '@utral/db-schema';

// ─── Expo-local sync / infra tables ───

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

// ─── Sync-engine metadata tables ───
// These were previously created imperatively in ExpoSqliteStorage.init().
// They are now part of the Drizzle-managed schema so useMigrations creates them.

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  operation: text('operation').notNull(),
  recordId: text('record_id').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown> | undefined>(),
  createdAt: text('created_at').notNull(),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
});

export const syncRecords = sqliteTable('sync_records', {
  id: text('id').notNull(),
  tableName: text('table_name').notNull(),
  record: text('record').notNull(),
  updatedAtWall: integer('updated_at_wall').notNull(),
  updatedAtCounter: integer('updated_at_counter').notNull(),
  updatedAtNode: text('updated_at_node').notNull(),
  deletedAtWall: integer('deleted_at_wall'),
  deletedAtCounter: integer('deleted_at_counter'),
  deletedAtNode: text('deleted_at_node'),
}, (table) => [
  primaryKey({ columns: [table.id, table.tableName] }),
]);

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value'),
});
