import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { SyncClientHandler, type SyncEventEmitter } from '@utral/sync-client';
import { createSqliteSyncStorage } from '@utral/db-schema/storage';
import { migrate } from './migrate.js';
import { WsTransport } from './ws-transport.js';
import type { Db } from './todos.js';

// Canonical table names + write order — mirrors the desktop `syncEngine.ts`.
// (The client handler no longer takes a table list; the server validates table names.)

export interface AppliedEvent {
  table: string;
  operation: string;
  recordId: string;
}

export interface TestClient {
  name: string;
  deviceId: string;
  db: Db;
  handler: SyncClientHandler;
  /** Every remote event the client merged locally, in order. */
  applied: AppliedEvent[];
  connect(): Promise<void>;
  disconnect(): void;
}

export interface CreateTestClientArgs {
  /** Human label, e.g. 'desktop' or 'expo'. Also seeds the deviceId + HLC node. */
  name: string;
  /** ws://…/ws/sync base URL from the test server. */
  wsUrl: string;
  userId: string;
  channel: string;
}

/**
 * Build a node-runnable sync client equivalent to what desktop/expo run: an
 * in-memory SQLite DB (desktop migrations) + the shared `createSqliteSyncStorage`
 * + a `ws` transport + the real `SyncClientHandler`. The only per-platform
 * difference in production is the SQLite driver and transport wrapper, both of
 * which are swapped here for their Node equivalents.
 */
export function createTestClient(args: CreateTestClientArgs): TestClient {
  const sqlite = new Database(':memory:');
  migrate(sqlite);
  const db = drizzle(sqlite) as unknown as Db;

  const storage = createSqliteSyncStorage(db as never);

  const deviceId = `${args.name}-${Math.abs(hashString(args.name + args.wsUrl + args.channel)).toString(36)}`;

  const applied: AppliedEvent[] = [];
  const emitter: SyncEventEmitter = {
    emitRemoteApplied(table, operation, recordId) {
      applied.push({ table, operation, recordId });
    },
  };

  // The handler appends deviceId/userId/channel to the URL itself (see
  // SyncClientHandler.buildConnectionUrl), so pass the bare server URL — this
  // exercises the same wiring the real desktop/expo apps rely on.
  const handler = new SyncClientHandler({
    serverUrl: args.wsUrl,
    deviceId,
    userId: args.userId,
    channel: args.channel,
    storage,
    transport: new WsTransport(),
    emitter,
    reconnect: null,
  });

  return {
    name: args.name,
    deviceId,
    db,
    handler,
    applied,
    async connect() {
      await handler.connect();
    },
    disconnect() {
      handler.disconnect();
      sqlite.close();
    },
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
