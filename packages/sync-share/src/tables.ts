// Canonical sync entity names used across the sync protocol.
//
// These names match the Drizzle table object names in @utral/db-schema and
// the exported table names in apps/server/src/db/schema. Clients and server
// use them as wire-format table identifiers.

/** Canonical sync table names. */
export const SYNC_TABLES = [
  'todos',
  'todoRelations',
  'todoLogs',
  'actionEdges',
  'plans',
  'pluses',
  'repeatOccurrences',
  'timeSlots',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** Set of canonical sync table names for O(1) lookups. */
export const SYNC_TABLE_SET: ReadonlySet<SyncTable> = new Set(SYNC_TABLES);
