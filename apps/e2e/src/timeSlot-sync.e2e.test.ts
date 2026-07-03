import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startTestServer, type TestServer } from './harness/test-server.js';
import { createTestClient, type TestClient } from './harness/test-client.js';
import { waitFor } from './harness/wait.js';
import { ensureTimeSlotTodo, type TimeSlotStore } from '@utral/db-schema/timeslots';
import { getTodo } from './harness/todos.js';

const USER_ID = 'u1';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

describe('timeSlot todo sync', () => {
  let desktop: TestClient;
  let expo: TestClient;
  let channelSeq = 0;

  beforeEach(async () => {
    const channel = `ts-${++channelSeq}`;
    desktop = createTestClient({ name: 'desktop', wsUrl: server.wsUrl, userId: USER_ID, channel });
    expo = createTestClient({ name: 'expo', wsUrl: server.wsUrl, userId: USER_ID, channel });
    await desktop.connect();
    await expo.connect();
  });

  afterEach(() => {
    desktop.disconnect();
    expo.disconnect();
  });

  it('syncs a timeSlot boundary todo via the shared engine (awaited notifyDbOperation)', async () => {
    const slot = {
      id: 'slot-morning',
      milestoneId: 'system:morning',
      title: 'Morning',
      time: '06:00',
      startHour: 6,
      startMinute: 0,
      endHour: 9,
      endMinute: 0,
    };

    const store: TimeSlotStore = {
      db: desktop.db,
      deviceId: desktop.deviceId,
      notifyDbOperation: async (entity, op, id) => {
        await desktop.handler.syncLocalChange(entity, op, id);
      },
    };

    const todoId = await ensureTimeSlotTodo(store, slot);

    const row = await waitFor(() => getTodo(expo.db, todoId), { label: 'timeSlot todo on expo' });
    expect(row).toBeDefined();
    expect(row.pattern).toBe('timeSlot');
    expect(row.isSystemTask).toBe(true);
  });

  it('syncs a timeSlot boundary todo with fire-and-forget notifyDbOperation (expo behavior)', async () => {
    const slot = {
      id: 'slot-evening',
      milestoneId: 'system:evening',
      title: 'Evening',
      time: '18:00',
      startHour: 18,
      startMinute: 0,
      endHour: 21,
      endMinute: 0,
    };

    const store: TimeSlotStore = {
      db: desktop.db,
      deviceId: desktop.deviceId,
      notifyDbOperation: (entity, op, id) => {
        // Mirrors apps/expo-app/src/lib/timeSlots.ts: not awaited.
        desktop.handler.syncLocalChange(entity, op, id).catch(() => {});
      },
    };

    const todoId = await ensureTimeSlotTodo(store, slot);
    // Give the fire-and-forget promise a tick to flush.
    await new Promise((r) => setTimeout(r, 50));

    const row = await waitFor(() => getTodo(expo.db, todoId), { label: 'timeSlot todo on expo (fire-forget)' });
    expect(row).toBeDefined();
    expect(row.pattern).toBe('timeSlot');
  });
});
