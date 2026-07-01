import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────────────────────
// Domain tables + row↔entity converters now live in the shared @utral/db-schema
// package and are re-exported here so the rest of the desktop app can keep
// importing them from './schema' unchanged.
//
// The sync/infra tables below are desktop-specific (key/value HLC + drizzle
// sync queue) and intentionally stay local.
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
  rowToTodo,
  todoToRow,
  rowToRelation,
  relationToRow,
  rowToTodoLog,
  todoLogToRow,
  rowToActionEdge,
  actionEdgeToRow,
  rowToPlan,
  planToRow,
  rowToPluse,
  pluseToRow,
  rowToRepeatOccurrence,
  repeatOccurrenceToRow,
  rowToTimeSlotDefinition,
  timeSlotDefinitionToRow,
} from '@utral/db-schema';

export type {
  Todo,
  TodoRelation,
  TodoLog,
  ActionEdge,
  Plan,
  Pluse,
  RepeatOccurrence,
  TimeSlotDefinition,
} from '@utral/db-schema';

// ─── Desktop-local sync / infra tables ───

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
