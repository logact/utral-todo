// ─────────────────────────────────────────────────────────────────────────────
// All domain tables AND the shared sync/infra tables (hlc_state, sync_config,
// sync_queue, sync_state) are re-exported from @utral/db-schema — the single
// source of truth for the SQLite schema shared with the desktop app.
//
// Domain records are stored in their real tables (no shadow `sync_records`
// table); the sync engine implements SyncRecordStorage directly against them.
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
} from '@utral/db-schema';
