import { getSyncConfigData, getDeviceId } from './database';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_RETRIES = 3;
const DEBOUNCE_MS = 2000;
const RETRY_DELAY_MS = 10000;

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
        createdAt: { wall: Date.now(), counter: 0, node: deviceId },
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
      }
    } catch {
      // Record may have been hard-deleted, skip
      continue;
    }

    if (!record) continue;

    const isDeleted = !!record.deletedAtWall;

    let payload: Record<string, unknown>;
    if (isDeleted) {
      payload = {
        deletedAtWall: record.deletedAtWall ?? Date.now(),
        deletedAtCounter: record.deletedAtCounter ?? 0,
        deletedAtNode: record.deletedAtNode ?? deviceId,
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
            createdAtWall: record.createdAtWall ?? Date.now(),
            createdAtCounter: record.createdAtCounter ?? 0,
            createdAtNode: record.createdAtNode ?? deviceId,
            updatedAtWall: record.updatedAtWall ?? Date.now(),
            updatedAtCounter: record.updatedAtCounter ?? 0,
            updatedAtNode: record.updatedAtNode ?? deviceId,
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
            timerStatus: record.timerStatus,
            currentIntervalIndex: record.currentIntervalIndex,
            startedAt: record.startedAt,
            accumulatedSeconds: record.accumulatedSeconds,
            createdAtWall: record.createdAtWall ?? Date.now(),
            createdAtCounter: record.createdAtCounter ?? 0,
            createdAtNode: record.createdAtNode ?? deviceId,
            updatedAtWall: record.updatedAtWall ?? Date.now(),
            updatedAtCounter: record.updatedAtCounter ?? 0,
            updatedAtNode: record.updatedAtNode ?? deviceId,
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
      createdAt: { wall: (record.updatedAtWall as number) ?? Date.now(), counter: 0, node: deviceId },
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
