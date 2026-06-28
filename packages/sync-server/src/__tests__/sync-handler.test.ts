import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncHandler } from '../sync-handler.js';
import type { ServerSocket, SyncHandlerOptions } from '../types.js';
import type { ServerSyncStorage, SyncEvent } from '@utral/sync-share';

vi.mock('@utral/sync-share', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@utral/sync-share')>();
  return {
    ...orig,
    newHLC: (nodeId: string) => ({ wall: Date.now(), counter: 0, node: nodeId }),
  };
});

function createMockSocket(): ServerSocket & { messages: string[]; closeCb?: () => void } {
  const socket: ServerSocket & { messages: string[]; closeCb?: () => void } = {
    id: '',
    messages: [],
    send(data: string) { socket.messages.push(data); },
    onClose(cb: () => void) { socket.closeCb = cb; },
  };
  return socket;
}

function createMockStorage(): ServerSyncStorage & { events: SyncEvent[] } {
  const store: ServerSyncStorage & { events: SyncEvent[] } = {
    events: [],
    async createSyncEvent(event: SyncEvent) {
      store.events.push(event);
      return event;
    },
    async getEventsSince() { return store.events; },
    async getEventsSinceHLC() { return store.events; },
    async getEventsBySeq(from: number, to: number) {
      return store.events.filter((e) => e.seq >= from && e.seq <= to);
    },
    trackEventDelivery: vi.fn(),
    ackEventDelivery: vi.fn(),
    async getPendingEventsForDevice() { return []; },
  };
  return store;
}

describe('SyncHandler', () => {
  let handler: SyncHandler;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
    handler = new SyncHandler({ storage, tables: ['notes', 'tasks'] });
  });

  describe('connect / disconnect', () => {
    it('should register a socket on connect', () => {
      const socket = createMockSocket();
      handler.connect('device-1', socket);
    });

    it('should clean up on disconnect', () => {
      const socket = createMockSocket();
      handler.connect('device-1', socket);
      socket.closeCb?.();
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('should subscribe and broadcast to other devices', async () => {
      const s1 = createMockSocket();
      const s2 = createMockSocket();
      handler.connect('device-1', s1);
      handler.connect('device-2', s2);

      handler.subscribe('device-1', 'user-1', 'default');
      handler.subscribe('device-2', 'user-1', 'default');

      const result = await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes', operation: 'create', recordId: 'r1', payload: { title: 'hi' } },
      ]);

      expect(result.accepted).toHaveLength(1);
      expect(s2.messages).toHaveLength(1);
      const eventMsg = JSON.parse(s2.messages[0]);
      expect(eventMsg.type).toBe('event');
      expect(eventMsg.event.table).toBe('notes');
      expect(s1.messages).toHaveLength(0);
    });

    it('should not broadcast to unsubscribed devices', async () => {
      const s1 = createMockSocket();
      const s2 = createMockSocket();
      handler.connect('device-1', s1);
      handler.connect('device-2', s2);

      handler.subscribe('device-1', 'user-1', 'default');
      handler.subscribe('device-2', 'user-1', 'default');
      handler.unsubscribe('device-2', 'user-1', 'default');

      await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes', operation: 'create', recordId: 'r1', payload: {} },
      ]);

      expect(s2.messages).toHaveLength(0);
    });
  });

  describe('push', () => {
    it('should accept valid items', async () => {
      const result = await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes', operation: 'create', recordId: 'r1', payload: { title: 'a' } },
        { table: 'tasks', operation: 'update', recordId: 'r2', payload: { done: true } },
      ]);
      expect(result.accepted).toHaveLength(2);
      expect(result.rejected).toHaveLength(0);
      expect(storage.events).toHaveLength(2);
    });

    it('should reject items with missing fields', async () => {
      const result = await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes' },
      ]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('missing required fields');
    });

    it('should reject items with unregistered table', async () => {
      const result = await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'unknown', operation: 'create', recordId: 'r1' },
      ]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('not registered');
    });

    it('should reject items with invalid operation', async () => {
      const result = await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes', operation: 'patch', recordId: 'r1' },
      ]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('invalid operation');
    });

    it('should assign sequential seq numbers', async () => {
      await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes', operation: 'create', recordId: 'r1' },
        { table: 'notes', operation: 'create', recordId: 'r2' },
        { table: 'notes', operation: 'create', recordId: 'r3' },
      ]);
      expect(storage.events[0].seq).toBe(1);
      expect(storage.events[1].seq).toBe(2);
      expect(storage.events[2].seq).toBe(3);
    });

    it('should track delivery for each subscribed device', async () => {
      const s1 = createMockSocket();
      const s2 = createMockSocket();
      handler.connect('device-1', s1);
      handler.connect('device-2', s2);
      handler.subscribe('device-1', 'user-1', 'default');
      handler.subscribe('device-2', 'user-1', 'default');

      await handler.acceptPush('device-1', 'user-1', 'default', [
        { table: 'notes', operation: 'create', recordId: 'r1' },
      ]);

      expect(storage.trackEventDelivery).toHaveBeenCalledWith(
        expect.any(String), 'device-2', 'default'
      );
      expect(storage.trackEventDelivery).not.toHaveBeenCalledWith(
        expect.any(String), 'device-1', 'default'
      );
    });
  });

  describe('event_ack', () => {
    it('should call storage.ackEventDelivery', () => {
      const socket = createMockSocket();
      handler.connect('device-1', socket);

      handler.handleMessage('device-1', JSON.stringify({
        type: 'event_ack', deviceId: 'device-1', eventIds: ['ev1', 'ev2'],
      }));

      expect(storage.ackEventDelivery).toHaveBeenCalledWith('device-1', ['ev1', 'ev2']);
    });
  });

  describe('pull_seq', () => {
    it('should return events by seq range and track delivery', async () => {
      const socket = createMockSocket();
      handler.connect('device-1', socket);

      storage.events = [
        { id: 'e1', seq: 1, table: 'notes', operation: 'create', recordId: 'r1', deviceId: 'd1', createdAt: { wall: 1, counter: 0, node: 'd1' } },
        { id: 'e2', seq: 2, table: 'notes', operation: 'update', recordId: 'r2', deviceId: 'd1', createdAt: { wall: 2, counter: 0, node: 'd1' } },
        { id: 'e3', seq: 3, table: 'notes', operation: 'delete', recordId: 'r3', deviceId: 'd1', createdAt: { wall: 3, counter: 0, node: 'd1' } },
      ];

      await handler['sendEventsBySeq']('device-1', socket, 'user-1', 'default', 1, 2);

      expect(socket.messages).toHaveLength(2);
      const msg1 = JSON.parse(socket.messages[0]);
      expect(msg1.type).toBe('event');
      expect(msg1.event.seq).toBe(1);
      const msg2 = JSON.parse(socket.messages[1]);
      expect(msg2.event.seq).toBe(2);
      expect(storage.trackEventDelivery).toHaveBeenCalledTimes(2);
    });
  });

  describe('broadcastToChannel', () => {
    it('should track delivery for each recipient', () => {
      const s1 = createMockSocket();
      const s2 = createMockSocket();
      handler.connect('device-1', s1);
      handler.connect('device-2', s2);
      handler.subscribe('device-1', 'user-1', 'default');
      handler.subscribe('device-2', 'user-1', 'default');

      const event: SyncEvent = {
        id: 'ev-1', seq: 1, table: 'notes', operation: 'create',
        recordId: 'r1', deviceId: 'device-1', createdAt: { wall: 1, counter: 0, node: 'd1' },
      };

      handler.broadcastToChannel('user-1', 'default', event, 'device-1');

      expect(storage.trackEventDelivery).toHaveBeenCalledWith('ev-1', 'device-2', 'default');
      expect(storage.trackEventDelivery).not.toHaveBeenCalledWith('ev-1', 'device-1', 'default');
    });

    it('should call onBroadcast hook', () => {
      const onBroadcast = vi.fn();
      const h = new SyncHandler({ storage, tables: ['notes'], onBroadcast });

      const s1 = createMockSocket();
      h.connect('device-1', s1);
      h.subscribe('device-1', 'user-1', 'default');

      const event: SyncEvent = {
        id: 'ev-1', seq: 1, table: 'notes', operation: 'create',
        recordId: 'r1', deviceId: 'd1', createdAt: { wall: 1, counter: 0, node: 'd1' },
      };

      h.broadcastToChannel('user-1', 'default', event, 'd1');
      expect(onBroadcast).toHaveBeenCalledWith(event, 'd1');
    });
  });

  describe('disconnect', () => {
    it('should not broadcast to disconnected clients', async () => {
      const socket = createMockSocket();
      handler.connect('device-1', socket);
      handler.subscribe('device-1', 'user-1', 'default');

      socket.closeCb?.();

      const s2 = createMockSocket();
      handler.connect('device-2', s2);
      handler.subscribe('device-2', 'user-1', 'default');

      const result = await handler.acceptPush('device-2', 'user-1', 'default', [
        { table: 'notes', operation: 'create', recordId: 'r1' },
      ]);

      expect(result.accepted).toHaveLength(1);
      expect(s2.messages).toHaveLength(0);
    });
  });
});
