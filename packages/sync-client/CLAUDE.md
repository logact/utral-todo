# sync-client

Client side of the sync library. **Read `../sync-share/CLAUDE.md` first** — it is
the canonical end-to-end description of how we sync. This file only covers what
is specific to the client.

## What lives here

- **`SyncClientHandler`** (`sync-handler.ts`) — the WebSocket client. Owns the
  connection lifecycle (connect / auto-reconnect with exponential backoff /
  disconnect), message routing, the local-change queue flush, the LWW merge
  (`applyRemoteEvent`), and batched `event_ack`s.
- **`ReorderBuffer`** (`reorder-buffer.ts`) — a `seq`-indexed sliding window that
  releases incoming events **in order** and requests gap backfill.
- **Interfaces** (`types.ts`) — `SyncQueueStorage`, `SyncRecordStorage`,
  `SyncStateStorage`, `SyncTransport`/`SyncSocket`, `SyncEventEmitter`. Apps
  implement these; the handler is platform-agnostic.

## How apps use it

Subclass `SyncClientHandler` and inject platform storage + transport. Example:
`apps/desktop/src/lib/sync/` (`TauriSyncHandler` + `TauriSqliteStorage` +
`TauriWebSocketTransport`). Expo has a parallel implementation under
`apps/expo-app/src/lib/sync/`.

## The two responsibilities

1. **Outbound:** `syncLocalChange(table, op, recordId)` reads the full record
   via `getRecord(table, recordId)`, attaches it as the event `payload` (so a
   receiving device can materialize a never-seen record, and the record's HLC
   `version` reaches the server), appends to the write-ahead queue
   (`SyncQueueStorage`) → `flushQueue()` sends one `push` message with all queued
   items when connected. `push-ack` removes accepted items and marks rejected
   ones for retry.
2. **Inbound:** `event` → `ReorderBuffer` → `applyRemoteEvent` (LWW merge via
   `compareHLC`) → `SyncRecordStorage` write → `emitRemoteApplied` (UI refresh)
   → batched `event_ack`.

## How to use the package

Add it as a workspace dependency:

```jsonc
// package.json
"dependencies": { "@utral/sync-client": "workspace:*" }
```

You don't use `SyncClientHandler` raw — you **subclass it once per platform** and
inject a storage impl (`SyncQueueStorage & SyncRecordStorage & SyncStateStorage`)
and a transport (`SyncTransport`). Reference impl: `apps/desktop/src/lib/sync/`.

```ts
import { SyncClientHandler, type SyncHandlerOptions } from '@utral/sync-client';

export class MySyncHandler extends SyncClientHandler {
  constructor(opts: Omit<SyncHandlerOptions, 'storage' | 'transport'>) {
    super({
      ...opts,
      storage: new MySqliteStorage(),      // implements the 3 storage interfaces
      transport: new MyWebSocketTransport() // implements SyncTransport → SyncSocket
    });
  }
}
```

Then wire it up in the app (desktop `syncEngine.ts` is the model):

```ts
const engine = new MySyncHandler({
  serverUrl: 'ws://localhost:3001/ws/sync',
  tables: ['todo', 'todoRelation', /* …canonical names… */],
  tableOrder: TABLE_ORDER,
  deviceId, userId, channel,
  emitter: { emitRemoteApplied: (t, op, id) =>
    window.dispatchEvent(new CustomEvent('db:changed', { detail: { table: t, operation: op, recordId: id } })) },
});

await engine.connect();                                 // opens the socket, auto-reconnects
await engine.syncLocalChange('todo', 'update', todoId); // queue + push a local write
// inbound events apply themselves via applyRemoteEvent and emit remoteApplied
```

App DB modules never call the engine directly with data — they write to local
storage first, then call the app's thin `syncLocalChange(table, op, id)` wrapper,
which forwards to `engine.syncLocalChange`. The engine reconstructs/queues the
event; merges on the receiving side are automatic.

To customize the merge or connection behavior, override the `protected` hooks
(`applyRemoteEvent`, `pullMissingEvents`, `onStateChange`, `onError`) in your
subclass rather than editing the base handler.

### Implementing the storage

The handler is storage-agnostic: you must supply an object implementing all three
storage interfaces from `types.ts`. The critical one is **`SyncRecordStorage`**.

> **Rule: `SyncRecordStorage` CRUDs the app's real, live domain tables — the same
> tables the UI queries — not a separate "sync" mirror.** When a remote event is
> merged, `applyRemoteEvent` calls `getRecord` / `addRecord` / `updateRecord` /
> `deleteRecord`; those writes must land in the actual `todos` / `todoRelations` /
> `pluses` / … tables so the change is immediately visible after the emitter fires
> `db:changed`. If you write to a shadow table, remote changes will sync but never
> appear in the app.

> **Rule: the invoker does NOT implement apply-remote or conflict-resolution logic
> — the sync lib owns it.** `SyncClientHandler.applyRemoteEvent` already does the
> ordering (via `ReorderBuffer`) and the last-writer-wins decision (via
> `compareHLC` on the HLC version) and only then calls your storage to persist the
> chosen outcome. Your storage methods must be **dumb CRUD**: read the row you're
> asked for, write the row you're given. Do **not** inside storage compare
> versions, decide a winner, skip a write because "mine looks newer", or field-merge
> two records — doing so double-merges and corrupts convergence. If the merge
> behavior needs to change, override the `protected applyRemoteEvent` hook in your
> handler subclass; never bake conflict logic into the storage layer.

`SyncRecordStorage` bridges the **canonical event world** (a flat
`SyncableRecord { id, version: HLC, isDeleted, ...fields }`, table addressed by
canonical name like `todo`) and your **real schema** (columns, split HLC
timestamp columns, real table objects). The bridge has three responsibilities:

1. **Map canonical name → real table.** Keep a lookup so `'todo'` resolves to your
   `todos` table, `'todoRelation'` → `todoRelations`, etc. (mirror of the
   `TABLE_NAME_MAP` used on the outbound side).
2. **Map `SyncableRecord.version` ↔ the row's `updatedAt` HLC.** The event's clock
   *is* the record's version. On read, expose `version = { wall, counter, node }`
   built from the row's `updatedAtWall/Counter/Node` columns. On write, split the
   incoming `version` back into those columns (and seed `createdAt*` when
   inserting). LWW correctness depends on this being exact.
3. **Represent delete as a tombstone.** A `delete` event sets `isDeleted = true` on
   the real row (soft delete synced like any other update) — do not physically
   remove it, or the tombstone can't propagate / re-merge.

Skeleton (see `apps/desktop/src/lib/sync/sqlite-storage.ts` for the full Drizzle
impl this is distilled from):

```ts
const TABLE = { todo: todos, todoRelation: todoRelations, /* …canonical → real… */ };

class MySqliteStorage implements SyncRecordStorage, SyncQueueStorage, SyncStateStorage {
  async getRecord(table, id): Promise<SyncableRecord | undefined> {
    const t = TABLE[table]; if (!t) return undefined;
    const row = (await db.select().from(t).where(eq(t.id, id)))[0];
    if (!row) return undefined;
    // version comes from the row's updatedAt HLC columns
    const rec: SyncableRecord = {
      id: row.id, isDeleted: row.isDeleted ?? false,
      version: { wall: row.updatedAtWall ?? 0, counter: row.updatedAtCounter ?? 0, node: row.updatedAtNode ?? '' },
    };
    for (const [k, v] of Object.entries(row)) if (!(k in rec)) rec[k] = v; // carry real columns
    return rec;
  }

  async addRecord(table, record): Promise<void> {
    const t = TABLE[table]; if (!t) return;
    const { version, createdAt, updatedAt, ...fields } = record as any;
    await db.insert(t).values({
      ...fields,                                        // real domain columns
      isDeleted: record.isDeleted ?? false,
      createdAtWall: createdAt?.wall ?? version?.wall, createdAtCounter: createdAt?.counter ?? 0, createdAtNode: createdAt?.node ?? '',
      updatedAtWall: version?.wall, updatedAtCounter: version?.counter ?? 0, updatedAtNode: version?.node ?? '',
    });
  }

  async updateRecord(table, id, changes): Promise<void> {
    const existing = await this.getRecord(table, id);
    // no local row yet → treat as insert so a never-seen record still materializes
    await this.addRecord(table, existing ? { ...existing, ...changes, id } : { ...changes, id });
  }

  async deleteRecord(table, id): Promise<void> {
    // NOTE: applyRemoteEvent handles `delete` as an update with isDeleted=true,
    // so this hard-delete is only for GC. Prefer the soft-delete path.
  }
  // + SyncQueueStorage (sync_queue table) and SyncStateStorage (sync_state table)
}
```

Two platform notes: if your schema stores HLC as one JSON column instead of split
columns, adapt steps 2 above to (de)serialize that column. And any schema-specific
normalization a record needs on arrival (e.g. desktop rewrites a `timeSlot` todo's
`scheduledDate` to the local slot start time to avoid cross-timezone sync loops)
belongs in `addRecord`, right before the insert.

## Client-specific refinement targets

See the full list in `../sync-share/CLAUDE.md`. The two that are purely client-side:

- `pullMissingEvents` sends `pull_request` and returns `[]`, but the server
  speaks `pull_seq`. The `ReorderBuffer` backfill path is currently dead — fix
  the message type and actually return the pulled events so ordering can recover
  from gaps.
- No unit tests exist for `ReorderBuffer` or `applyRemoteEvent`. Add them before
  refactoring the merge.
