# sync-server

Server side of the sync library. **Read `../sync-share/CLAUDE.md` first** — it is
the canonical end-to-end description of how we sync. This file only covers what
is specific to the server.

## What lives here

- **`SyncHandler`** (`sync-handler.ts`) — the relay. It does **no CRDT merge**.
  It validates and accepts push batches, assigns a per-channel monotonic `seq`,
  persists each `SyncEvent`, and broadcasts to the other subscribers of the
  `(userId, channel)` channel. Also serves `pull_seq` catch-up and records
  per-device delivery.
- **`SqliteSyncStorage`** (`sqlite-storage.ts`) — the complete reference
  `ServerSyncStorage` implementation (event log + `device_event_queue`). Used by
  tests; the production server uses `DrizzlePgSyncStorage` in
  `apps/server/src/sync/`.

## The relay contract

1. `acceptPush` validates each item (required fields, registered `table`, valid
   `operation`), assigns `seq`, stamps `id`, sets `createdAt` from the writer's
   HLC (`payload.version`, else `newHLC(deviceId)`), persists, broadcasts
   (to **all** subscribers **including** the origin device — see below), and
   replies `push-ack { accepted, rejected }`.
2. `broadcastToChannel` sends `event` to each subscribed socket (including the
   origin device, so its per-channel `seq` stream stays contiguous for the client
   reorder buffer) and calls `trackEventDelivery`. The client recognizes its own
   events by `event.deviceId` and advances its buffer without re-applying them.
3. `pull_seq { from, to }` replays a `seq` range to one device.
4. `event_ack` marks delivery complete.

Registered tables are passed in by the app (`apps/server/src/sync/setup.ts`):
`todo, todoRelation, todoLog, actionEdge, pluse, repeatOccurrence, plan, timeSlot`.

## How to use the package

Add it as a workspace dependency (it ships compiled — `main` is `./dist`, so run
`pnpm --filter @utral/sync-server build` after changes):

```jsonc
// package.json
"dependencies": { "@utral/sync-server": "workspace:*" }
```

Construct one `SyncHandler` with a `ServerSyncStorage`, then bridge your
WebSocket server to it. Reference wiring: `apps/server/src/index.ts` +
`apps/server/src/sync/setup.ts`.

```ts
import { SyncHandler, SqliteSyncStorage } from '@utral/sync-server';
import Database from 'better-sqlite3';

const storage = new SqliteSyncStorage(new Database(':memory:'));
storage.init();                              // creates tables + prepares statements

export const syncHandler = new SyncHandler({
  storage,
  tables: ['todo', 'todoRelation', 'todoLog', 'actionEdge',
           'pluse', 'repeatOccurrence', 'plan', 'timeSlot'],
  onBroadcast: (event, excludeDeviceId) => {/* optional external hook, e.g. push notifs */},
});
```

Bridge each WebSocket connection to the handler — give it a framework-agnostic
`ServerSocket` and forward raw messages:

```ts
wss.on('connection', (ws, req) => {
  const { deviceId, userId, channel } = parseQuery(req.url);
  syncHandler.connect(deviceId, {
    id: deviceId,
    send: (data) => ws.readyState === ws.OPEN && ws.send(data),
    onClose: (cb) => ws.on('close', cb),
  });
  syncHandler.subscribe(deviceId, userId, channel);
  ws.on('message', (data) => syncHandler.handleMessage(deviceId, data.toString()));
  ws.on('close', () => syncHandler.disconnect(deviceId));
});
```

`handleMessage` dispatches the wire protocol (`subscribe`/`unsubscribe`/`push`/
`pull_seq`/`event_ack`) for you. To use a different backing store (e.g. Postgres),
implement `ServerSyncStorage` — `SqliteSyncStorage` is the complete reference,
and `apps/server/src/sync/pg-storage.ts` is the (incomplete) Postgres port.

## Tests

`src/__tests__/` — handler unit tests, `SqliteSyncStorage` tests, and a
real-WebSocket e2e. Run: `pnpm --filter @utral/sync-server test`. Treat these as
the behavioral spec for the relay.

## Server-specific refinement targets

See the full list in `../sync-share/CLAUDE.md`. Server-side ones:

- `acceptPush` **now preserves** the writer's originating HLC: it reads
  `payload.version` (the record's `updatedAt` clock) into `event.createdAt` via
  the `extractClientHLC` helper, falling back to `newHLC(deviceId)` only for
  legacy/empty payloads. LWW order is now writer logical time. (Resolved — kept
  here as a pointer to the mechanism.)
- The production Postgres storage (`apps/server/src/sync/pg-storage.ts`) has
  no-op delivery tracking and a `tableName`-vs-`table` column mismatch in its read
  mappers. `SqliteSyncStorage` here is the correct reference to port from.
