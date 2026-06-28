import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteSyncStorage } from '../sqlite-storage.js';
import type { SyncEvent } from '@utral/sync-share';

function makeEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    seq: overrides.seq ?? 1,
    table: overrides.table ?? 'notes',
    operation: overrides.operation ?? 'create',
    recordId: overrides.recordId ?? crypto.randomUUID(),
    payload: overrides.payload !== undefined ? overrides.payload : { title: 'test' },
    deviceId: overrides.deviceId ?? 'device-1',
    createdAt: overrides.createdAt ?? { wall: Date.now(), counter: 0, node: 'device-1' },
  };
}

describe('SqliteSyncStorage', () => {
  let db: Database.Database;
  let storage: SqliteSyncStorage;

  beforeEach(() => {
    db = new Database(':memory:');
    storage = new SqliteSyncStorage(db);
    storage.init();
  });

  describe('sync_events', () => {
    it('should create and retrieve a sync event', async () => {
      const event = makeEvent();
      await storage.createSyncEvent(event);
      const events = await storage.getEventsSince(new Date(0));
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(event.id);
      expect(events[0].payload).toEqual({ title: 'test' });
    });

    it('should retrieve events since a given date', async () => {
      const past = makeEvent({ createdAt: { wall: 1000, counter: 0, node: 'd1' } });
      const future = makeEvent({ createdAt: { wall: 2000, counter: 0, node: 'd1' } });
      await storage.createSyncEvent(past);
      await storage.createSyncEvent(future);
      const events = await storage.getEventsSince(new Date(1500));
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(future.id);
    });

    it('should retrieve events since HLC timestamp', async () => {
      const e1 = makeEvent({ createdAt: { wall: 1000, counter: 0, node: 'd1' } });
      const e2 = makeEvent({ createdAt: { wall: 1000, counter: 1, node: 'd1' } });
      const e3 = makeEvent({ createdAt: { wall: 1000, counter: 0, node: 'd2' } });
      await storage.createSyncEvent(e1);
      await storage.createSyncEvent(e2);
      await storage.createSyncEvent(e3);
      const events = await storage.getEventsSinceHLC({ wall: 1000, counter: 0, node: 'd1' });
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.id)).toContain(e2.id);
      expect(events.map((e) => e.id)).toContain(e3.id);
    });

    it('should retrieve events by seq range', async () => {
      const e1 = makeEvent({ seq: 1 });
      const e2 = makeEvent({ seq: 2 });
      const e3 = makeEvent({ seq: 3 });
      await storage.createSyncEvent(e1);
      await storage.createSyncEvent(e2);
      await storage.createSyncEvent(e3);
      const events = await storage.getEventsBySeq(1, 2);
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.seq)).toEqual([1, 2]);
    });

    it('should handle null payload as undefined on read', async () => {
      const event = makeEvent({ payload: null as unknown });
      await storage.createSyncEvent(event);
      const events = await storage.getEventsSince(new Date(0));
      expect(events[0].payload).toBeUndefined();
    });
  });

  describe('device_event_queue', () => {
    it('should track event delivery', async () => {
      const event = makeEvent();
      await storage.createSyncEvent(event);
      storage.trackEventDelivery(event.id, 'device-2', 'default');
      const pending = await storage.getPendingEventsForDevice('device-2');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(event.id);
    });

    it('should ack event delivery', async () => {
      const event = makeEvent();
      await storage.createSyncEvent(event);
      storage.trackEventDelivery(event.id, 'device-2', 'default');
      storage.ackEventDelivery('device-2', [event.id]);
      const pending = await storage.getPendingEventsForDevice('device-2');
      expect(pending).toHaveLength(0);
    });

    it('should only return pending events for the specified device', async () => {
      const e1 = makeEvent({ seq: 1 });
      const e2 = makeEvent({ seq: 2 });
      await storage.createSyncEvent(e1);
      await storage.createSyncEvent(e2);
      storage.trackEventDelivery(e1.id, 'device-a', 'default');
      storage.trackEventDelivery(e2.id, 'device-b', 'default');
      const pendingA = await storage.getPendingEventsForDevice('device-a');
      expect(pendingA).toHaveLength(1);
      expect(pendingA[0].id).toBe(e1.id);
      const pendingB = await storage.getPendingEventsForDevice('device-b');
      expect(pendingB).toHaveLength(1);
      expect(pendingB[0].id).toBe(e2.id);
    });

    it('should ignore duplicate tracking (UNIQUE constraint)', async () => {
      const event = makeEvent();
      await storage.createSyncEvent(event);
      storage.trackEventDelivery(event.id, 'device-2', 'default');
      storage.trackEventDelivery(event.id, 'device-2', 'default');
      const pending = await storage.getPendingEventsForDevice('device-2');
      expect(pending).toHaveLength(1);
    });

    it('should batch ack multiple events', async () => {
      const e1 = makeEvent({ seq: 1 });
      const e2 = makeEvent({ seq: 2 });
      const e3 = makeEvent({ seq: 3 });
      await storage.createSyncEvent(e1);
      await storage.createSyncEvent(e2);
      await storage.createSyncEvent(e3);
      storage.trackEventDelivery(e1.id, 'device-2', 'default');
      storage.trackEventDelivery(e2.id, 'device-2', 'default');
      storage.trackEventDelivery(e3.id, 'device-2', 'default');
      storage.ackEventDelivery('device-2', [e1.id, e3.id]);
      const pending = await storage.getPendingEventsForDevice('device-2');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(e2.id);
    });

    it('should return pending events ordered by seq', async () => {
      const e1 = makeEvent({ seq: 3 });
      const e2 = makeEvent({ seq: 1 });
      const e3 = makeEvent({ seq: 2 });
      await storage.createSyncEvent(e1);
      await storage.createSyncEvent(e2);
      await storage.createSyncEvent(e3);
      storage.trackEventDelivery(e1.id, 'device-2', 'default');
      storage.trackEventDelivery(e2.id, 'device-2', 'default');
      storage.trackEventDelivery(e3.id, 'device-2', 'default');
      const pending = await storage.getPendingEventsForDevice('device-2');
      expect(pending.map((e) => e.seq)).toEqual([1, 2, 3]);
    });

    it('acking a non-existent event should be a no-op', async () => {
      storage.ackEventDelivery('device-2', ['non-existent-id']);
      const pending = await storage.getPendingEventsForDevice('device-2');
      expect(pending).toHaveLength(0);
    });
  });
});
