import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────────────────────
// Shared SQLite sync/infra schema for Utral Todo clients (desktop + mobile).
//
// These are the sync-plumbing tables used by the client sync engine. They use a
// generic key/value shape for HLC + config state, a durable outbox (`sync_queue`)
// and a small key/value `sync_state` store. Domain records are NOT shadowed
// here — clients implement SyncRecordStorage directly against the real domain
// tables in `./schema`.
// ─────────────────────────────────────────────────────────────────────────────

export const hlcState = sqliteTable('hlc_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
});

export const syncConfig = sqliteTable('sync_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  operation: text('operation').notNull(),
  recordId: text('record_id').notNull(),
  payload: text('payload'),
  createdAt: text('created_at').notNull(),
  retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
});

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value'),
});
