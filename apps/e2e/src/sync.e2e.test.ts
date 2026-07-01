import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { startTestServer, type TestServer } from './harness/test-server.js';
import { createTestClient, type TestClient } from './harness/test-client.js';
import { insertTodo, updateTodoTitle, softDeleteTodo, getTodo } from './harness/todos.js';
import { waitFor } from './harness/wait.js';

// End-to-end sync between a "desktop" client and an "expo" client through a real
// in-process server. Both clients run the identical shared sync stack
// (SyncClientHandler + createSqliteSyncStorage) over real WebSockets; the server
// is the real @utral/sync-server relay. This exercises the full path:
// local write → queue → push → server persist + broadcast → remote merge (LWW/HLC).

const USER_ID = 'u1';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

describe('desktop ⇄ expo sync', () => {
  let desktop: TestClient;
  let expo: TestClient;
  let channelSeq = 0;

  beforeEach(async () => {
    // The server's seq counter is per-(userId, channel) and monotonic for the
    // life of the process. Give each test its own channel so its sequence starts
    // at 1 (what a fresh client's reorder buffer expects) — isolating tests that
    // share the one beforeAll server.
    const channel = `default-${++channelSeq}`;
    desktop = createTestClient({ name: 'desktop', wsUrl: server.wsUrl, userId: USER_ID, channel });
    expo = createTestClient({ name: 'expo', wsUrl: server.wsUrl, userId: USER_ID, channel });
    await desktop.connect();
    await expo.connect();
  });

  afterEach(() => {
    desktop.disconnect();
    expo.disconnect();
  });

  it('propagates a create from desktop to expo', async () => {
    const id = 'todo-create-1';
    insertTodo(desktop.db, { id, title: 'Write e2e test', node: desktop.deviceId });

    await desktop.handler.syncLocalChange('todo', 'create', id);

    const row = await waitFor(() => getTodo(expo.db, id), { label: 'todo on expo' });
    expect(row.title).toBe('Write e2e test');
    expect(expo.applied).toContainEqual({ table: 'todo', operation: 'create', recordId: id });
  });

  it('propagates an update from expo to desktop', async () => {
    const id = 'todo-update-1';
    // Seed the record on both sides via a create from desktop.
    insertTodo(desktop.db, { id, title: 'original', node: desktop.deviceId });
    await desktop.handler.syncLocalChange('todo', 'create', id);
    await waitFor(() => getTodo(expo.db, id), { label: 'seed on expo' });

    // Expo edits the title (bumps its HLC so it wins LWW) and pushes.
    updateTodoTitle(expo.db, id, 'edited on expo', expo.deviceId);
    await expo.handler.syncLocalChange('todo', 'update', id);

    const row = await waitFor(
      () => {
        const r = getTodo(desktop.db, id);
        return r && r.title === 'edited on expo' ? r : undefined;
      },
      { label: 'updated title on desktop' },
    );
    expect(row.title).toBe('edited on expo');
  });

  it('propagates a delete as a tombstone', async () => {
    const id = 'todo-delete-1';
    insertTodo(desktop.db, { id, title: 'to be deleted', node: desktop.deviceId });
    await desktop.handler.syncLocalChange('todo', 'create', id);
    await waitFor(() => getTodo(expo.db, id), { label: 'seed on expo' });

    softDeleteTodo(desktop.db, id, desktop.deviceId);
    await desktop.handler.syncLocalChange('todo', 'delete', id);

    const row = await waitFor(
      () => {
        const r = getTodo(expo.db, id);
        return r && r.isDeleted ? r : undefined;
      },
      { label: 'tombstone on expo' },
    );
    expect(row.isDeleted).toBe(true);
  });
});
