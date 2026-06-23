import { getSyncConfigData, getDeviceId } from './database';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';

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

// Pending changes queue — only dirty records are pushed
const pendingChanges: Map<string, any> = new Map();

export function addPendingChange(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
  payload?: Record<string, unknown> | null
): void {
  const key = `${table}:${recordId}`;
  // If already pending as delete, keep it as delete
  const existing = pendingChanges.get(key);
  if (existing?.operation === 'delete') return;
  pendingChanges.set(key, { table, operation, recordId, payload });
}

async function pushToServer(): Promise<void> {
  if (pendingChanges.size === 0) return;

  const config = await getSyncConfigData();
  if (!config?.serverUrl) return;

  const deviceId = await getDeviceId();

  // Take a snapshot and clear the queue
  const entries = Array.from(pendingChanges.values());
  pendingChanges.clear();

  const changes: any[] = [];

  for (const entry of entries) {
    const { table, operation, recordId } = entry;

    if (operation === 'delete') {
      changes.push({
        table,
        operation: 'delete',
        recordId,
        payload: entry.payload ?? {},
        deviceId,
        createdAt: toHLC(new Date().toISOString(), deviceId),
      });
      continue;
    }

    // For create/update, read the current record from DB
    let record: Record<string, unknown> | undefined;
    try {
      switch (table) {
        case 'todo': {
          const rows = await db.select().from(schema.todos).where(eq(schema.todos.id, recordId)).limit(1);
          record = rows[0] as Record<string, unknown> | undefined;
          break;
        }
        case 'pluse': {
          const rows = await db.select().from(schema.pluses).where(eq(schema.pluses.id, recordId)).limit(1);
          record = rows[0] as Record<string, unknown> | undefined;
          break;
        }
        case 'timerSession': {
          const rows = await db.select().from(schema.timerSessions).where(eq(schema.timerSessions.id, recordId)).limit(1);
          record = rows[0] as Record<string, unknown> | undefined;
          break;
        }
      }
    } catch {
      // Record may have been hard-deleted, skip
      continue;
    }

    if (!record) continue;

    const isDeleted = !!record.deletedAt;

    let payload: Record<string, unknown>;
    if (isDeleted) {
      payload = {
        deletedAtWall: toHLC(record.deletedAt as string, deviceId).wall,
        deletedAtCounter: 0,
        deletedAtNode: deviceId,
      };
    } else {
      switch (table) {
        case 'todo':
          payload = {
            id: record.id,
            title: record.title,
            description: record.description,
            nodeType: record.nodeType,
            pattern: record.pattern,
            status: record.status,
            priority: record.priority,
            goalStatus: record.goalStatus,
            estimatedMinutes: record.estimatedMinutes,
            scheduledDate: record.scheduledDate,
            scheduledEndDate: record.scheduledEndDate,
            dueDate: record.dueDate,
            startedAt: record.startedAt,
            completedAt: record.completedAt,
            parentId: record.parentId,
            activePlanId: record.activePlanId,
            isRootGoal: record.isRootGoal,
            isSystemTask: record.isSystemTask,
            motivation: record.motivation,
            successCriteria: record.successCriteria,
            targetDate: record.targetDate,
            repeatRule: record.repeatRule,
            tags: record.tags,
            order: record.order,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            versionWall: record.versionWall ?? toHLC(record.updatedAt as string, deviceId).wall,
            versionCounter: record.versionCounter ?? 0,
            versionNode: record.versionNode ?? deviceId,
          };
          break;
        case 'pluse':
          payload = {
            id: record.id,
            name: record.name,
            description: record.description,
            intervals: record.intervals,
            repeatCount: record.repeatCount,
            autoAdvance: record.autoAdvance,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            versionWall: record.versionWall ?? toHLC(record.updatedAt as string, deviceId).wall,
            versionCounter: record.versionCounter ?? 0,
            versionNode: record.versionNode ?? deviceId,
          };
          break;
        case 'timerSession':
          payload = {
            id: record.id,
            type: record.type || 'pluse',
            pluseId: record.pluseId,
            todoId: record.todoId,
            name: record.name,
            intervals: record.intervals,
            repeatCount: record.repeatCount,
            currentIndex: record.currentIndex,
            elapsedSeconds: record.elapsedSeconds,
            status: record.status,
            startedAt: record.startedAt,
            pausedAt: record.pausedAt,
            completedAt: record.completedAt,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            versionWall: record.versionWall ?? toHLC(record.updatedAt as string, deviceId).wall,
            versionCounter: record.versionCounter ?? 0,
            versionNode: record.versionNode ?? deviceId,
          };
          break;
        default:
          continue;
      }
    }

    changes.push({
      table,
      operation: isDeleted ? 'delete' : operation,
      recordId,
      payload,
      deviceId,
      createdAt: toHLC((record.updatedAt as string) ?? new Date().toISOString(), deviceId),
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
