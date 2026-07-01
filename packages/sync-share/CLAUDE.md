# Sync library — how we sync (canonical reference)

This is the authoritative description of the Utral Todo sync system. The three
`packages/sync-*` packages implement it together; this file lives in
`sync-share` because it is the shared core that both the client and server
import. `sync-client/CLAUDE.md` and `sync-server/CLAUDE.md` describe their side
and point back here.

> Scope: this documents the **event-relay WebSocket sync** — the live path used
> today. The desktop `apps/desktop/src/db/sync.ts` full-HTTP `syncAll` and the
> Expo SSE path are **legacy** and are not part of this library.

## Mental model in one sentence

Every device keeps a **full local copy** of the data and writes to it first;
each write is turned into an **event** that is pushed over a WebSocket to a
**dumb relay server**, which fans it out to the user's other devices, where a
**last-writer-wins (LWW) CRDT merge** applies it. No device ever waits on the
server to make a change.

## The three packages

| Package        | Role                                                                 | Runs where            |
| -------------- | ------------------------------------------------------------------- | --------------------- |
| `sync-share`   | Pure types + HLC clock + wire-protocol shapes. No runtime deps.     | Both                  |
| `sync-client`  | `SyncClientHandler` + `ReorderBuffer` + storage/transport interfaces | Desktop, Expo         |
| `sync-server`  | `SyncHandler` (relay) + `SqliteSyncStorage`                          | Server                |

Apps subclass the client handler and provide platform storage + transport:
- Desktop: `apps/desktop/src/lib/sync/` (`TauriSyncHandler`, `TauriSqliteStorage`, `TauriWebSocketTransport`).
- Server: `apps/server/src/sync/setup.ts` wires `SyncHandler` to Postgres (`DrizzlePgSyncStorage`).

## How to use the package

`@utral/sync-share` is a zero-runtime-dependency package of pure types + the HLC
clock. Add it as a workspace dependency and import the primitives directly:

```jsonc
// package.json
"dependencies": { "@utral/sync-share": "workspace:*" }
```

```ts
import {
  newHLC, mergeHLC, compareHLC,        // clock ops
  type HLCTimestamp, type SyncEvent,   // wire types
  type SyncableRecord, type ServerSyncStorage,
} from '@utral/sync-share';

// Stamp a new local write
const node = 'device-abc';
let version = newHLC(node);

// Advance past a version you just received
version = mergeHLC(version, remote.createdAt);

// Decide a last-writer-wins winner
const remoteWins = compareHLC(remote.createdAt, local.version) > 0;
```

You normally don't import `sync-share` directly in app code — you get its types
re-exported through `@utral/sync-client` / `@utral/sync-server`, and through the
app's own `types` barrel (e.g. desktop `src/types/index.ts` re-exports the HLC
helpers). Import it directly only in the sync packages themselves or when you
need a clock primitive with no transport attached.

> Do **not** import from `sync-share/crdt.ts` — those exports throw. See below.

## Core primitives (`sync-share`)

### HLC — Hybrid Logical Clock (`hlc.ts`)

```ts
interface HLCTimestamp { wall: number; counter: number; node: string }
```

- `newHLC(node, wall?)` → fresh stamp (`wall = Date.now()` by default).
- `mergeHLC(local, remote)` → advances the local clock past a remote one.
- `compareHLC(a, b)` → total order: compare `wall`, then `counter`, then `node`
  (the `node` string is the deterministic tie-breaker).

**LWW rule:** for a given record, the version with the greater HLC wins. Because
`node` breaks ties, two devices that write "simultaneously" (equal wall+counter)
still converge to the same winner.

### SyncEvent — the unit of replication (`hlc.ts`)

```ts
interface SyncEvent {
  id: string;                                   // server-assigned UUID
  seq: number;                                  // per-channel monotonic sequence
  table: string;                                // canonical table name (see mapping)
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;                            // the full record (client-serialized)
  deviceId: string;                             // origin device
  createdAt: HLCTimestamp;                      // event clock
}
```

### Wire protocol (`types.ts`)

Client → server: `subscribe`, `unsubscribe`, `push`, `pull_seq`, `event_ack`.
Server → client: `event`, `push-ack`, (`pull_response`).

A **channel** is keyed by `(userId, channel)`. `seq` is monotonic **per channel**.

### `crdt.ts` is intentionally empty

`sync-share/crdt.ts` exports stubs that `throw 'Not implemented'`. The real merge
logic lives in the client (`applyRemoteEvent`). Do not build on `crdt.ts`
without implementing it first — see "Refinement targets".

## The full flow

### 1. Local write (client)

App DB modules (`apps/desktop/src/db/*.ts`) never talk to the network. They:

1. Write to local SQLite via Drizzle, stamping
   `updatedAt = mergeHLC(existing.updatedAt, newHLC(nodeId))`.
2. Call `syncLocalChange(table, op, recordId)` (fire-and-forget).
3. Dispatch a `db:changed` window event so `useDbChangeRefresh` re-queries the UI.

`syncLocalChange` enqueues a `SyncQueueItem` (write-ahead log in the `sync_queue`
table) and flushes the queue: if connected, it sends a single `push` message
with all queued items.

> Note: the queue item's `payload` carries the **full record** as read from
> local storage (`getRecord(table, recordId)`) at enqueue time. This lets a
> receiving device that has never seen the record materialize it from the event
> alone. The record's `version` (its `updatedAt` HLC) travels inside the payload
> and is the writer's originating logical clock — the server preserves it (see
> step 2).

### 2. Accept + relay (server) — `SyncHandler.acceptPush`

The server does **no merging**. For each pushed item it:

1. Validates: `table`/`operation`/`recordId` present; `table` is in the
   registered `tables` list; `operation` is one of create/update/delete.
2. Assigns the next per-channel `seq`.
3. Builds a `SyncEvent` with `id = randomUUID()` and preserves the writer's
   originating HLC as `createdAt` — taken from `payload.version` (the record's
   `updatedAt` clock), falling back to `newHLC(deviceId)` only for legacy/empty
   payloads with no valid version. Persists it via `storage.createSyncEvent`.
4. `broadcastToChannel(userId, channel, event, excludeDeviceId=origin)` — sends
   an `event` message to every other subscribed device and records a
   per-device delivery row.
5. Replies to the origin with `push-ack { accepted, rejected }`.

Registered tables (server `setup.ts`):
`todo, todoRelation, todoLog, actionEdge, pluse, repeatOccurrence, plan, timeSlot`.

### 3. Receive + merge (client) — `SyncClientHandler`

Incoming `event` messages do **not** apply immediately. They go through the
`ReorderBuffer` first (see below), which releases them **in `seq` order**. For
each released event `applyRemoteEvent` runs the LWW merge:

- Look up the existing local record; its version is `updatedAt` (or `MIN_HLC`).
- Compare `event.createdAt` vs existing version with `compareHLC`.
- `create` with no local record → insert. Otherwise merge fields, keeping the
  newer version's values (`comparison > 0` ⇒ remote wins).
- `update`/`delete` → same LWW comparison; `delete` sets `isDeleted = true`.
- On success, emit `remoteApplied(table, op, recordId)` → the desktop emitter
  dispatches `db:changed` so the UI refreshes.

Applied events are ACKed back in **batches** (`event_ack`, flushed ~100 ms) so
the server can mark per-device delivery complete.

### ReorderBuffer (`sync-client/reorder-buffer.ts`)

A fixed-size sliding window indexed by `seq`. It guarantees events apply in
sequence and never out of order:

- An event at `seq` is placed at `window[seq - nextSeq]`.
- After each insert it flushes contiguous events from the front and slides the
  window right, advancing `nextSeq`.
- If a gap persists (window fills past `thresholdSize`, or the oldest slot ages
  past `thresholdTime`), it calls `pullMissing(from, to)` to backfill.

### Catch-up after downtime — `pull_seq`

When a device reconnects it can request a `seq` range with `pull_seq { from, to }`;
the server replies with the matching `event` messages (and tracks delivery).
This is how a device that missed events while offline catches up.

### Connection lifecycle

`SyncClientHandler` manages `idle → connecting → connected → reconnecting`. On an
unexpected socket close it auto-reconnects with exponential backoff
(`initialDelayMs * multiplier^attempt`, capped at `maxDelayMs`, up to `maxRetries`).
`disconnect()` is a clean shutdown with no retry.

## Table-name mapping (desktop)

Local Drizzle store names differ from the canonical `SyncEvent` table names.
`apps/desktop/src/lib/sync/syncEngine.ts` maps them:

```
todos → todo   relations → todoRelation   todoLogs → todoLog
actionEdges → actionEdge   plans → plan   pluses → pluse
repeatOccurrences → repeatOccurrence   timeSlots → timeSlot
```

Keep both directions consistent when adding a table.

## Storage contracts

Client (`sync-client/types.ts`): `SyncQueueStorage` (write-ahead queue),
`SyncRecordStorage` (get/add/update/delete a record by table+id),
`SyncStateStorage` (deviceId, lastSyncAt).

Server (`sync-share/types.ts` → `ServerSyncStorage`): create/query events by
date / HLC / seq, and per-device delivery tracking (`trackEventDelivery`,
`ackEventDelivery`, `getPendingEventsForDevice`).

## Known gaps / refinement targets

These are real inconsistencies in the current implementation — the reason this
doc exists is to refine them. Verify against code before changing.

1. **Pull-message mismatch.** The client's `pullMissingEvents` sends
   `type: 'pull_request'` (with a `since: Date`) and returns `[]`, but the server
   only handles `pull_seq { from, to }`. The `ReorderBuffer` gap-backfill path is
   therefore effectively a no-op. Unify on `pull_seq` (or implement
   `pull_request` server-side) and actually return the pulled events.
2. **~~Server overwrites the event clock.~~ (RESOLVED)** `acceptPush` now
   preserves the writer's originating HLC by reading `payload.version` (the
   record's `updatedAt` clock) into `event.createdAt`, falling back to
   `newHLC(deviceId)` only for legacy/empty payloads. LWW ordering now reflects
   writer logical time, not server-arrival order.
3. **~~Empty payloads.~~ (RESOLVED)** `syncLocalChange` now reads the full record
   via `getRecord(table, recordId)` and pushes it as the payload, so a device
   that has never seen a record can materialize it from the event alone. The
   payload also carries the record's `version`, which powers gap #2's fix.
4. **`crdt.ts` is stubs.** If we want a shared, testable merge function used by
   both client and (future) server-side conflict handling, implement it here
   instead of only inside `applyRemoteEvent`.
5. **Postgres delivery tracking is a no-op.** `apps/server/src/sync/pg-storage.ts`
   `trackEventDelivery`/`ackEventDelivery`/`getPendingEventsForDevice` are stubs,
   and its read mappers reference `e.tableName` while the PG column is `table`.
   The SQLite storage (`sqlite-storage.ts`) is the complete reference impl.
6. **`node` identity.** Desktop `getOrCreateDeviceId()` currently returns the sync
   connection *state* string, so the HLC `node` is not a stable device id. A
   stable per-device id is needed for correct tie-breaking.

## Tests

`packages/sync-server/src/__tests__/` covers the relay end to end (handler unit
tests, SQLite storage, and a real-WebSocket e2e). There are no client-side
`ReorderBuffer`/`applyRemoteEvent` tests yet — add them alongside any merge
refactor.
