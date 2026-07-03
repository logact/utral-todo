import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startTestServer, type TestServer } from './harness/test-server.js';
import { createTestClient, type TestClient } from './harness/test-client.js';
import { waitFor } from './harness/wait.js';
import { bootstrapApp, type BootstrapStore } from '@utral/db-schema/bootstrap';
import { todos, plans, pluses, timeSlots } from '@utral/db-schema';

const USER_ID = 'u1';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

describe('startup bootstrap sync', () => {
  let desktop: TestClient;
  let expo: TestClient;
  let channelSeq = 0;

  beforeEach(async () => {
    const channel = `boot-${++channelSeq}`;
    desktop = createTestClient({ name: 'desktop', wsUrl: server.wsUrl, userId: USER_ID, channel });
    expo = createTestClient({ name: 'expo', wsUrl: server.wsUrl, userId: USER_ID, channel });
    await desktop.connect();
    await expo.connect();
  });

  afterEach(() => {
    desktop.disconnect();
    expo.disconnect();
  });

  it('syncs root goal, root plan, default time slots, default pluse, and boundary todos from bootstrap', async () => {
    const store: BootstrapStore = {
      db: desktop.db,
      deviceId: desktop.deviceId,
      notifyDbOperation: async (entity: string, op: 'create' | 'update' | 'delete', id: string) => {
        await desktop.handler.syncLocalChange(entity, op, id);
      },
    };

    // Simulate a first-launch desktop bootstrap.
    await bootstrapApp(store);

    // Root goal
    const rootGoal = await waitFor(
      () => {
        const rows = desktop.db.select().from(todos).where(eq(todos.id, 'system:root-goal')).all();
        return rows[0];
      },
      { label: 'root goal on desktop' }
    );
    expect(rootGoal).toBeDefined();
    expect(rootGoal.isRootGoal).toBe(true);

    const rootGoalOnExpo = await waitFor(
      () => {
        const rows = expo.db.select().from(todos).where(eq(todos.id, 'system:root-goal')).all();
        return rows[0];
      },
      { label: 'root goal on expo' }
    );
    expect(rootGoalOnExpo).toBeDefined();
    expect(rootGoalOnExpo.isRootGoal).toBe(true);

    // Root plan
    const rootPlanOnExpo = await waitFor(
      () => {
        const rows = expo.db.select().from(plans).where(eq(plans.id, 'system:root-plan')).all();
        return rows[0];
      },
      { label: 'root plan on expo' }
    );
    expect(rootPlanOnExpo).toBeDefined();
    expect(rootPlanOnExpo.goalTodoId).toBe('system:root-goal');

    // Default time slots
    const morningSlotOnExpo = await waitFor(
      () => {
        const rows = expo.db.select().from(timeSlots).where(eq(timeSlots.id, 'slot-morning')).all();
        return rows[0];
      },
      { label: 'default time slot on expo' }
    );
    expect(morningSlotOnExpo).toBeDefined();
    expect(morningSlotOnExpo.title).toBe('Day Startup Plan');

    // Default pluse
    const pluseOnExpo = await waitFor(
      () => {
        const rows = expo.db.select().from(pluses).where(eq(pluses.id, 'system:default-pluse')).all();
        return rows[0];
      },
      { label: 'default pluse on expo' }
    );
    expect(pluseOnExpo).toBeDefined();
    expect(pluseOnExpo.name).toBe('Focus');
    expect(pluseOnExpo.intervals).toEqual([1500]);

    // Boundary todo for the morning slot start boundary
    const boundaryOnExpo = await waitFor(
      () => {
        const rows = expo.db.select().from(todos).where(eq(todos.id, 'timeslot:0600')).all();
        return rows[0];
      },
      { label: 'timeSlot boundary todo on expo' }
    );
    expect(boundaryOnExpo).toBeDefined();
    expect(boundaryOnExpo.pattern).toBe('timeSlot');
    expect(boundaryOnExpo.isSystemTask).toBe(true);
  });
});
