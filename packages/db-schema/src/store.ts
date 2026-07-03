// ─────────────────────────────────────────────────────────────────────────────
// Shared store interface for @utral/db-schema operation engines.
//
// Each engine (todos, pluse, plans, relations, etc.) operates on any Drizzle db
// over the shared @utral/db-schema tables via this injected context. Platform
// specifics — how the db is opened, where the device id comes from, how sync is
// notified, and how the UI refreshes — live in the apps, not the engines.
// ─────────────────────────────────────────────────────────────────────────────

export interface DbStore {
  /** Drizzle db instance over the shared @utral/db-schema tables. */
  db: any;

  /** Resolve the local device/node id used to stamp HLCs. */
  deviceId: string;

  /** Record a local mutation so the app's sync layer can push it. */
  notifyDbOperation(
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string
  ): void | Promise<void>;

  
}

/** Resolve an id generator from the store, falling back to the global helper. */
export function getGenerateId(_store: DbStore): () => string {
  return generateIdFallback;
}

function generateIdFallback(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
