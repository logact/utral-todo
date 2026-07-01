import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { SyncHandler, SqliteSyncStorage, type ServerSocket } from '@utral/sync-server';

/** Canonical syncable table names — mirrors `apps/server/src/sync/setup.ts`. */
const TABLES = [
  'todo',
  'todoRelation',
  'todoLog',
  'actionEdge',
  'pluse',
  'repeatOccurrence',
  'plan',
  'timeSlot',
];

export interface TestServer {
  port: number;
  /** ws://127.0.0.1:<port>/ws/sync */
  wsUrl: string;
  handler: SyncHandler;
  close(): Promise<void>;
}

/**
 * Boot an in-process sync hub identical to `apps/server/src/index.ts`, minus
 * Express/Postgres: a real `ws` server on `/ws/sync` bridged to the real
 * `@utral/sync-server` `SyncHandler` over an in-memory SQLite event store.
 *
 * Connection handshake matches production exactly: deviceId / userId / channel
 * come from URL query params, then connect() + subscribe(), and every incoming
 * message is forwarded to handleMessage().
 */
export async function startTestServer(): Promise<TestServer> {
  const db = new Database(':memory:');
  const storage = new SqliteSyncStorage(db);
  storage.init();

  const handler = new SyncHandler({ storage, tables: TABLES });

  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/sync' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const deviceId = url.searchParams.get('deviceId') || 'unknown';
    const userId = url.searchParams.get('userId') || deviceId;
    const channel = url.searchParams.get('channel') || 'default';

    const socket: ServerSocket = {
      id: deviceId,
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      },
      onClose: (cb: () => void) => {
        ws.on('close', cb);
      },
    };
    handler.connect(deviceId, socket);

    handler.subscribe(deviceId, userId, channel);

    ws.on('message', (data) => {
      handler.handleMessage(deviceId, data.toString());
    });

    ws.on('close', () => {
      handler.disconnect(deviceId);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server failed to bind a port');
  }
  const port = address.port;

  return {
    port,
    wsUrl: `ws://127.0.0.1:${port}/ws/sync`,
    handler,
    async close() {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      db.close();
    },
  };
}
