import { getSyncConfigData, getDeviceId } from './database';
import { db, schema } from '../db';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_RETRIES = 3;
const DEBOUNCE_MS = 2000;
const RETRY_DELAY_MS = 10000;

function toHLC(isoString: string | null | undefined, deviceId: string) {
  const wall = isoString ? new Date(isoString).getTime() : Date.now();
  return { wall, counter: 0, node: deviceId };
}

async function pushToServer(): Promise<void> {
  const config = await getSyncConfigData();
  if (!config?.serverUrl) return;

  const deviceId = await getDeviceId();

  // Read all local data including soft-deleted
  const [todos, pluses, timerSessions] = await Promise.all([
    db.select().from(schema.todos),
    db.select().from(schema.pluses),
    db.select().from(schema.timerSessions),
  ]);

  const now = Date.now();
  const changes: any[] = [];

  for (const todo of todos) {
    const isDeleted = !!todo.deletedAt;
    changes.push({
      table: 'todo',
      operation: isDeleted ? 'delete' : 'create',
      recordId: todo.id,
      payload: isDeleted
        ? { deletedAtWall: toHLC(todo.deletedAt, deviceId).wall, deletedAtCounter: 0, deletedAtNode: deviceId }
        : {
            id: todo.id,
            title: todo.title,
            description: todo.description,
            nodeType: todo.nodeType,
            pattern: todo.nodeType,
            status: todo.status,
            priority: todo.priority,
            goalStatus: todo.goalStatus,
            estimatedMinutes: todo.estimatedMinutes,
            scheduledDate: todo.scheduledDate,
            dueDate: todo.dueDate,
            tags: todo.tags,
            order: todo.order,
            createdAt: todo.createdAt,
            updatedAt: todo.updatedAt,
            versionWall: todo.versionWall ?? 0,
            versionCounter: todo.versionCounter ?? 0,
            versionNode: todo.versionNode ?? '',
          },
      deviceId,
      createdAt: toHLC(todo.updatedAt, deviceId),
    });
  }

  for (const pluse of pluses) {
    const isDeleted = !!pluse.deletedAt;
    changes.push({
      table: 'pluse',
      operation: isDeleted ? 'delete' : 'create',
      recordId: pluse.id,
      payload: isDeleted
        ? { deletedAtWall: toHLC(pluse.deletedAt, deviceId).wall, deletedAtCounter: 0, deletedAtNode: deviceId }
        : {
            id: pluse.id,
            name: pluse.name,
            description: pluse.description,
            intervals: pluse.intervals,
            repeatCount: pluse.repeatCount,
            autoAdvance: pluse.autoAdvance,
            createdAt: pluse.createdAt,
            updatedAt: pluse.updatedAt,
            versionWall: pluse.versionWall ?? 0,
            versionCounter: pluse.versionCounter ?? 0,
            versionNode: pluse.versionNode ?? '',
          },
      deviceId,
      createdAt: toHLC(pluse.updatedAt, deviceId),
    });
  }

  for (const session of timerSessions) {
    const isDeleted = !!session.deletedAt;
    changes.push({
      table: 'timerSession',
      operation: isDeleted ? 'delete' : 'create',
      recordId: session.id,
      payload: isDeleted
        ? { deletedAtWall: toHLC(session.deletedAt, deviceId).wall, deletedAtCounter: 0, deletedAtNode: deviceId }
        : {
            id: session.id,
            type: session.type || 'pluse',
            pluseId: session.pluseId,
            todoId: session.todoId,
            name: session.name,
            intervals: session.intervals,
            repeatCount: session.repeatCount,
            currentIndex: session.currentIndex,
            elapsedSeconds: session.elapsedSeconds,
            status: session.status,
            startedAt: session.startedAt,
            pausedAt: session.pausedAt,
            completedAt: session.completedAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            versionWall: session.versionWall ?? 0,
            versionCounter: session.versionCounter ?? 0,
            versionNode: session.versionNode ?? '',
          },
      deviceId,
      createdAt: toHLC(session.updatedAt, deviceId),
    });
  }

  if (changes.length === 0) return;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiToken) headers['Authorization'] = `Bearer ${config.apiToken}`;

  const response = await fetch(`${config.serverUrl}/api/sync/push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deviceId, changes }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Push failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const result = await response.json();
  console.log(`[auto-sync] Pushed ${changes.length} changes, accepted: ${result.accepted}, rejected: ${result.rejected?.length ?? 0}`);

  // Pull remote changes after push
  const { syncAll } = await import('./sync');
  await syncAll();
}

function attemptPush(): void {
  pushToServer()
    .then(() => {
      retryCount = 0;
    })
    .catch((err) => {
      console.log('[auto-sync] Push failed:', err?.message || err);
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[auto-sync] Retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
        retryTimer = setTimeout(attemptPush, RETRY_DELAY_MS);
      } else {
        console.log('[auto-sync] Max retries reached, will sync on next mutation');
        retryCount = 0;
      }
    });
}

export function scheduleSyncPush(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryCount = 0;

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    attemptPush();
  }, DEBOUNCE_MS);
}
