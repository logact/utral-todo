// ─────────────────────────────────────────────────────────────────────────────
// Domain tables + row↔entity converters and the sync/infra tables (hlc_state,
// sync_config, sync_queue, sync_state) now all live in the shared
// @utral/db-schema package and are re-exported here so the rest of the desktop
// app can keep importing them from './schema' unchanged.
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
  hlcState,
  syncConfig,
  syncQueue,
  syncState,
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
