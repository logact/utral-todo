// Canonical sync entity names used across the sync protocol.
//
// These names are the wire-format table identifiers: client queue items,
// server events, and the @utral/db-schema storage layer all agree on them.
// Apps that use different local table names (e.g. desktop's `todos` table)
// must map to these canonical names at the point where they notify sync.

/** Canonical sync table names. */
export const SYNC_TABLES = [
  'todo',
  'todoRelation',
  'todoLog',
  'actionEdge',
  'plan',
  'pluse',
  'repeatOccurrence',
  'timeSlot',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** Set of canonical sync table names for O(1) lookups. */
export const SYNC_TABLE_SET: ReadonlySet<SyncTable> = new Set(SYNC_TABLES);

/**
 * Legacy / local table-name → canonical sync table name.
 * Desktop still uses pluralized Drizzle table names in some call sites; this
 * map lets callers normalize before handing an event to the sync engine.
 */
export const TABLE_NAME_MAP: Record<string, SyncTable> = {
  todos: 'todo',
  todoRelations: 'todoRelation',
  todoLogs: 'todoLog',
  actionEdges: 'actionEdge',
  plans: 'plan',
  pluses: 'pluse',
  repeatOccurrences: 'repeatOccurrence',
  timeSlots: 'timeSlot',
};
