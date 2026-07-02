import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import Database from 'better-sqlite3';
import { SyncHandler } from '../sync-handler.js';
import { SqliteSyncStorage } from '../sqlite-storage.js';
import type { ServerSocket } from '../types.js';
import type { SyncEvent } from '@utral/sync-share';

vi.mock('@utral/sync-share', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@utral/sync-share')>();
  return {
    ...orig,
    newHLC: (nodeId: string) => ({ wall: Date.now(), counter: 0, node: nodeId }),
  };
});

let httpServer: http.Server;
let wss: WebSocketServer;
let db: Database.Database;

function getPort(): number {
  const addr = httpServer.address();
  if (!addr || typeof addr === 'string') throw new Error('Server not started');
  return addr.port;
}

/**
 * Connect a client via real WebSocket.
 * The client sends a { type: 'register', deviceId } message first,
 * which the WSS uses to create a ServerSocket and call handler.connect().
 * Subsequent messages from the client are routed to handler.handleMessage().
 */
function connectClient(handler: SyncHandler, deviceId: string): Promise<{
  ws: WebSocket;
  messages: Record<string, unknown>[];
  send: (msg: object) => void;
  waitFor: (type: string, timeout?: number) => Promise<Record<string, unknown>>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${getPort()}`);
    const messages: Record<string, unknown>[] = [];

    ws.on('error', reject);

    ws.on('open', () => {
      // Send register message so the WSS can set up routing
      ws.send(JSON.stringify({ type: 'register', deviceId }));

      // Wait a tick for the register to be processed, then resolve
      setTimeout(() => {
        resolve({
          ws,
          messages,
          send: (msg: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
          },
          waitFor: (type: string, timeout = 3000) => {
            return new Promise((res, rej) => {
              const existing = messages.find((m) => m.type === type);
              if (existing) return res(existing);

              const timer = setTimeout(() => rej(new Error(`Timeout waiting for ${type}`)), timeout);
              const check = setInterval(() => {
                const found = messages.find((m) => m.type === type);
                if (found) {
                  clearTimeout(timer);
                  clearInterval(check);
                  res(found);
                }
              }, 10);
            });
          },
        });
      }, 20);
    });

    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch { /* ignore parse errors */ }
    });
  });
}

beforeAll(async () => {
  db = new Database(':memory:');
  httpServer = http.createServer();
  wss = new WebSocketServer({ server: httpServer });

  // Route messages: first message must be { type: 'register', deviceId }
  wss.on('connection', (ws) => {
    let registeredDeviceId: string | null = null;

    ws.on('message', (data) => {
      const raw = data.toString();
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw); } catch { return; }

      if (!registeredDeviceId && msg.type === 'register') {
        registeredDeviceId = msg.deviceId as string;

        const handler = activeHandlers[0];
        if (!handler) return;

        const socket: ServerSocket = {
          id: registeredDeviceId,
          send(d: string) {
            if (ws.readyState === WebSocket.OPEN) ws.send(d);
          },
          onClose(cb) { ws.on('close', cb); },
        };
        handler.connect(registeredDeviceId, socket);
        return;
      }

      if (registeredDeviceId) {
        for (const h of activeHandlers) {
          try {
            h.handleMessage(registeredDeviceId, raw);
            break;
          } catch { /* not in this handler */ }
        }
      }
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
});

afterEach(() => {
  activeHandlers.length = 0;
  db.exec('DELETE FROM sync_events');
  db.exec('DELETE FROM device_event_queue');
});

afterAll(() => {
  wss.close();
  httpServer.close();
  db.close();
});

const activeHandlers: SyncHandler[] = [];

function makeHandler(): SyncHandler {
  const storage = new SqliteSyncStorage(db);
  storage.init();
  const handler = new SyncHandler({ storage, tables: ['notes', 'tasks'] });
  activeHandlers.push(handler);
  return handler;
}

describe('E2E: Full sync flow', () => {
  it('should broadcast events from one client to another', async () => {
    const handler = makeHandler();

    const clientA = await connectClient(handler, 'device-a');
    const clientB = await connectClient(handler, 'device-b');

    clientA.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    clientB.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    await new Promise((r) => setTimeout(r, 50));

    clientA.send({
      type: 'push',
      deviceId: 'user-1',
      channel: 'default',
      items: [{ table: 'notes', operation: 'create', recordId: 'note-1', payload: { title: 'Hello' } }],
    });

    const event = await clientB.waitFor('event') as { event: SyncEvent };
    expect(event.event.table).toBe('notes');
    expect(event.event.operation).toBe('create');
    expect(event.event.recordId).toBe('note-1');
    expect(event.event.payload).toEqual({ title: 'Hello' });

    const ack = await clientA.waitFor('push-ack') as { accepted: string[]; rejected: unknown[] };
    expect(ack.accepted).toHaveLength(1);
    expect(ack.rejected).toHaveLength(0);

    clientA.ws.close();
    clientB.ws.close();
  });

  it('should assign sequential seq numbers across pushes', async () => {
    const handler = makeHandler();

    const clientA = await connectClient(handler, 'device-a');
    const clientB = await connectClient(handler, 'device-b');

    clientA.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    clientB.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    await new Promise((r) => setTimeout(r, 50));

    clientA.send({
      type: 'push', deviceId: 'user-1', channel: 'default',
      items: [
        { table: 'notes', operation: 'create', recordId: 'n1', payload: { title: 'one' } },
        { table: 'notes', operation: 'create', recordId: 'n2', payload: { title: 'two' } },
      ],
    });

    const ev1 = await clientB.waitFor('event') as { event: SyncEvent };
    await new Promise((r) => setTimeout(r, 100));
    const ev2 = clientB.messages.find((m) => m.type === 'event' && (m.event as SyncEvent).recordId === 'n2') as { event: SyncEvent };

    expect(ev1.event.seq).toBe(1);
    expect(ev2.event.seq).toBe(2);

    clientA.ws.close();
    clientB.ws.close();
  });

  it('should deliver events on pull_seq', async () => {
    const handler = makeHandler();

    const clientA = await connectClient(handler, 'device-a');
    const clientB = await connectClient(handler, 'device-b');

    clientA.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    clientB.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    await new Promise((r) => setTimeout(r, 50));

    clientA.send({
      type: 'push', deviceId: 'user-1', channel: 'default',
      items: [
        { table: 'notes', operation: 'create', recordId: 'n1' },
        { table: 'notes', operation: 'create', recordId: 'n2' },
        { table: 'notes', operation: 'create', recordId: 'n3' },
      ],
    });

    await new Promise((r) => setTimeout(r, 200));

    clientB.send({ type: 'pull_seq', deviceId: 'user-1', channel: 'default', from: 1, to: 2 });

    const ev1 = await clientB.waitFor('event') as { event: SyncEvent };
    expect(ev1.event.seq).toBe(1);

    clientA.ws.close();
    clientB.ws.close();
  });

  it('should reject push with unregistered table', async () => {
    const handler = makeHandler();

    const clientA = await connectClient(handler, 'device-a');

    clientA.send({
      type: 'push', deviceId: 'user-1', channel: 'default',
      items: [{ table: 'unknown_table', operation: 'create', recordId: 'r1' }],
    });

    const ack = await clientA.waitFor('push-ack') as { accepted: string[]; rejected: Array<{ reason: string }> };
    expect(ack.accepted).toHaveLength(0);
    expect(ack.rejected).toHaveLength(1);
    expect(ack.rejected[0].reason).toContain('not registered');

    clientA.ws.close();
  });

  it('should handle multiple channels independently', async () => {
    const handler = makeHandler();

    const clientA = await connectClient(handler, 'device-a');
    const clientB = await connectClient(handler, 'device-b');
    const clientC = await connectClient(handler, 'device-c');

    clientA.send({ type: 'subscribe', deviceId: 'user-1', channel: 'ch-a' });
    clientB.send({ type: 'subscribe', deviceId: 'user-1', channel: 'ch-b' });
    clientC.send({ type: 'subscribe', deviceId: 'user-1', channel: 'ch-a' });
    await new Promise((r) => setTimeout(r, 50));

    clientA.send({
      type: 'push', deviceId: 'user-1', channel: 'ch-a',
      items: [{ table: 'notes', operation: 'create', recordId: 'n1' }],
    });

    const evC = await clientC.waitFor('event');
    expect(evC).toBeDefined();

    await new Promise((r) => setTimeout(r, 200));
    const chBEvents = clientB.messages.filter((m) => m.type === 'event');
    expect(chBEvents).toHaveLength(0);

    clientA.ws.close();
    clientB.ws.close();
    clientC.ws.close();
  });

  it('should catch up via pull_seq after disconnect and reconnect', async () => {
    const handler = makeHandler();

    const clientA = await connectClient(handler, 'device-a');
    let clientB = await connectClient(handler, 'device-b');

    clientA.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    clientB.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    await new Promise((r) => setTimeout(r, 50));

    clientA.send({
      type: 'push', deviceId: 'user-1', channel: 'default',
      items: [{ table: 'notes', operation: 'create', recordId: 'n1' }],
    });
    await clientB.waitFor('event');
    await new Promise((r) => setTimeout(r, 50));

    clientB.ws.close();
    await new Promise((r) => setTimeout(r, 200));

    clientA.send({
      type: 'push', deviceId: 'user-1', channel: 'default',
      items: [{ table: 'notes', operation: 'create', recordId: 'n2' }],
    });
    await new Promise((r) => setTimeout(r, 200));

    clientB = await connectClient(handler, 'device-b');
    clientB.send({ type: 'subscribe', deviceId: 'user-1', channel: 'default' });
    await new Promise((r) => setTimeout(r, 50));

    clientB.send({ type: 'pull_seq', deviceId: 'user-1', channel: 'default', from: 1, to: 10 });

    const caughtUp = await clientB.waitFor('event') as { event: SyncEvent };
    expect(caughtUp.event.recordId).toBe('n1');

    clientA.ws.close();
    clientB.ws.close();
  });
});
