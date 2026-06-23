import EventSource from 'react-native-sse';
import { eq } from 'drizzle-orm';
import { db, expoDb, schema } from '../db';
import { getAllTodos } from './todos';
import { getAllPluses } from './pluse';
import { queryClient } from './query-client';
import {
  getSyncConfigData,
  setSyncConfigData,
  getDeviceId,
  getLastSyncAt,
  setLastSyncAt,
  type SyncConfig,
} from './database';

export async function getSyncConfig(): Promise<SyncConfig | null> {
  return getSyncConfigData();
}

export async function setSyncConfig(config: SyncConfig): Promise<void> {
  return setSyncConfigData(config);
}

async function syncFetch(path: string, options: RequestInit = {}): Promise<any> {
  const config = await getSyncConfig();
  if (!config?.serverUrl) throw new Error('Sync server not configured');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  const url = `${config.serverUrl}${path}`;
  console.log(`[sync] ${options.method || 'GET'} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (e: any) {
    console.log('[sync] Network error:', e?.message);
    throw new Error(`Network error: ${e?.message || 'cannot reach server'}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.text();
      detail = body.slice(0, 200);
      console.log(`[sync] Error response ${response.status}:`, detail);
    } catch {}
    throw new Error(`Sync failed: ${response.status}${detail ? ` — ${detail}` : ''}`);
  }

  return response.json();
}

// Map camelCase server fields to snake_case local fields
const camelToSnakeMap: Record<string, string> = {
  nodeType: 'node_type',
  goalStatus: 'goal_status',
  estimatedMinutes: 'estimated_minutes',
  scheduledDate: 'scheduled_date',
  dueDate: 'due_date',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
  versionWall: 'version_wall',
  versionCounter: 'version_counter',
  versionNode: 'version_node',
  autoAdvance: 'auto_advance',
  repeatCount: 'repeat_count',
  pluseId: 'pluse_id',
  todoId: 'todo_id',
  currentIndex: 'current_index',
  elapsedSeconds: 'elapsed_seconds',
  startedAt: 'started_at',
  pausedAt: 'paused_at',
  completedAt: 'completed_at',
};

function mapServerRecord(record: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const mappedKey = camelToSnakeMap[key] || key;
    mapped[mappedKey] = value;
  }
  return mapped;
}

// Local SQLite column names per table (must match actual CREATE TABLE)
const todoColumns = new Set([
  'id', 'title', 'description', 'node_type', 'status', 'priority', 'goal_status',
  'estimated_minutes', 'scheduled_date', 'due_date', 'tags', 'order',
  'created_at', 'updated_at', 'deleted_at', 'version_wall', 'version_counter', 'version_node',
]);
const pluseColumns = new Set([
  'id', 'name', 'description', 'intervals', 'repeat_count', 'auto_advance',
  'created_at', 'updated_at', 'deleted_at', 'version_wall', 'version_counter', 'version_node',
]);
const timerSessionColumns = new Set([
  'id', 'type', 'pluse_id', 'todo_id', 'name', 'intervals', 'repeat_count',
  'current_index', 'elapsed_seconds', 'status', 'started_at', 'paused_at', 'completed_at',
  'created_at', 'updated_at', 'deleted_at', 'version_wall', 'version_counter', 'version_node',
]);

function pickColumns(record: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (allowed.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function ensureDates(record: Record<string, unknown>): void {
  const now = new Date().toISOString();
  if (typeof record.created_at !== 'string' || !record.created_at) record.created_at = now;
  if (typeof record.updated_at !== 'string' || !record.updated_at) record.updated_at = now;
}

function safeJson(value: unknown): string {
  if (value === null || value === undefined) return '[]';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function syncAll(): Promise<void> {
  console.log('[sync] syncAll v5');
  const config = await getSyncConfig();
  if (!config?.serverUrl) throw new Error('Sync server not configured');

  // Pull all remote data via legacy GET /api/sync
  const remote = await syncFetch('/api/sync');
  console.log('[sync] Pulled from server:', {
    todos: remote.todos?.length ?? 0,
    pluses: remote.pluses?.length ?? 0,
    timerSessions: remote.timerSessions?.length ?? 0,
  });

  if (remote.todos?.length) {
    console.log('[sync] First server todo keys:', Object.keys(remote.todos[0]).join(', '));
    for (const item of remote.todos) {
      const record = pickColumns(mapServerRecord(item), todoColumns);
      ensureDates(record);
      const now = new Date().toISOString();
      const createdAt = (typeof record.created_at === 'string' && record.created_at) ? record.created_at : now;
      const updatedAt = (typeof record.updated_at === 'string' && record.updated_at) ? record.updated_at : now;
      console.log(`[sync] Upserting todo ${record.id}, createdAt=${createdAt}`);
      await db.insert(schema.todos).values({
        id: record.id as string,
        title: (record.title as string) ?? 'Untitled',
        description: (record.description as string) ?? '',
        nodeType: (record.node_type as string) ?? 'task',
        status: (record.status as string) ?? 'pending',
        priority: (record.priority as string) ?? 'medium',
        goalStatus: (record.goal_status as string) ?? null,
        estimatedMinutes: (record.estimated_minutes as number) ?? 0,
        scheduledDate: (record.scheduled_date as string) ?? null,
        dueDate: (record.due_date as string) ?? null,
        tags: Array.isArray(record.tags) ? record.tags : [],
        order: (record.order as number) ?? 0,
        createdAt,
        updatedAt,
        deletedAt: (record.deleted_at as string) ?? null,
        versionWall: (record.version_wall as number) ?? null,
        versionCounter: (record.version_counter as number) ?? 0,
        versionNode: (record.version_node as string) ?? null,
      }).onConflictDoUpdate({
        target: schema.todos.id,
        set: {
          title: (record.title as string) ?? 'Untitled',
          description: (record.description as string) ?? '',
          nodeType: (record.node_type as string) ?? 'task',
          status: (record.status as string) ?? 'pending',
          priority: (record.priority as string) ?? 'medium',
          goalStatus: (record.goal_status as string) ?? null,
          estimatedMinutes: (record.estimated_minutes as number) ?? 0,
          scheduledDate: (record.scheduled_date as string) ?? null,
          dueDate: (record.due_date as string) ?? null,
          tags: Array.isArray(record.tags) ? record.tags : [],
          order: (record.order as number) ?? 0,
          createdAt,
          updatedAt,
          deletedAt: (record.deleted_at as string) ?? null,
          versionWall: (record.version_wall as number) ?? null,
          versionCounter: (record.version_counter as number) ?? 0,
          versionNode: (record.version_node as string) ?? null,
        },
      });
    }
  }

  if (remote.pluses?.length) {
    for (const item of remote.pluses) {
      const record = pickColumns(mapServerRecord(item), pluseColumns);
      ensureDates(record);
      const now = new Date().toISOString();
      const createdAt = (typeof record.created_at === 'string' && record.created_at) ? record.created_at : now;
      const updatedAt = (typeof record.updated_at === 'string' && record.updated_at) ? record.updated_at : now;
      await db.insert(schema.pluses).values({
        id: record.id as string,
        name: (record.name as string) ?? 'Untitled Pluse',
        description: (record.description as string) ?? '',
        intervals: Array.isArray(record.intervals) ? record.intervals : [1500],
        repeatCount: (record.repeat_count as number) ?? 1,
        autoAdvance: record.auto_advance ? true : false,
        createdAt,
        updatedAt,
        deletedAt: (record.deleted_at as string) ?? null,
        versionWall: (record.version_wall as number) ?? null,
        versionCounter: (record.version_counter as number) ?? 0,
        versionNode: (record.version_node as string) ?? null,
      }).onConflictDoUpdate({
        target: schema.pluses.id,
        set: {
          name: (record.name as string) ?? 'Untitled Pluse',
          description: (record.description as string) ?? '',
          intervals: Array.isArray(record.intervals) ? record.intervals : [1500],
          repeatCount: (record.repeat_count as number) ?? 1,
          autoAdvance: record.auto_advance ? true : false,
          createdAt,
          updatedAt,
          deletedAt: (record.deleted_at as string) ?? null,
          versionWall: (record.version_wall as number) ?? null,
          versionCounter: (record.version_counter as number) ?? 0,
          versionNode: (record.version_node as string) ?? null,
        },
      });
    }
  }

  if (remote.timerSessions?.length) {
    for (const item of remote.timerSessions) {
      const record = pickColumns(mapServerRecord(item), timerSessionColumns);
      ensureDates(record);
      const now = new Date().toISOString();
      const createdAt = (typeof record.created_at === 'string' && record.created_at) ? record.created_at : now;
      const updatedAt = (typeof record.updated_at === 'string' && record.updated_at) ? record.updated_at : now;
      await db.insert(schema.timerSessions).values({
        id: record.id as string,
        type: (record.type as string) ?? 'pluse',
        pluseId: (record.pluse_id as string) ?? null,
        todoId: (record.todo_id as string) ?? null,
        name: (record.name as string) ?? '',
        intervals: Array.isArray(record.intervals) ? record.intervals : [],
        repeatCount: (record.repeat_count as number) ?? 1,
        currentIndex: (record.current_index as number) ?? 0,
        elapsedSeconds: (record.elapsed_seconds as number) ?? 0,
        status: (record.status as string) ?? 'running',
        startedAt: (record.started_at as string) ?? new Date().toISOString(),
        pausedAt: (record.paused_at as string) ?? null,
        completedAt: (record.completed_at as string) ?? null,
        createdAt,
        updatedAt,
        deletedAt: (record.deleted_at as string) ?? null,
        versionWall: (record.version_wall as number) ?? null,
        versionCounter: (record.version_counter as number) ?? 0,
        versionNode: (record.version_node as string) ?? null,
      }).onConflictDoUpdate({
        target: schema.timerSessions.id,
        set: {
          type: (record.type as string) ?? 'pluse',
          pluseId: (record.pluse_id as string) ?? null,
          todoId: (record.todo_id as string) ?? null,
          name: (record.name as string) ?? '',
          intervals: Array.isArray(record.intervals) ? record.intervals : [],
          repeatCount: (record.repeat_count as number) ?? 1,
          currentIndex: (record.current_index as number) ?? 0,
          elapsedSeconds: (record.elapsed_seconds as number) ?? 0,
          status: (record.status as string) ?? 'running',
          startedAt: (record.started_at as string) ?? new Date().toISOString(),
          pausedAt: (record.paused_at as string) ?? null,
          completedAt: (record.completed_at as string) ?? null,
          createdAt,
          updatedAt,
          deletedAt: (record.deleted_at as string) ?? null,
          versionWall: (record.version_wall as number) ?? null,
          versionCounter: (record.version_counter as number) ?? 0,
          versionNode: (record.version_node as string) ?? null,
        },
      });
    }
  }

  await setLastSyncAt(new Date());
  queryClient.invalidateQueries({ queryKey: ['todos'] });
  queryClient.invalidateQueries({ queryKey: ['pluses'] });
  queryClient.invalidateQueries({ queryKey: ['timerSessions'] });
}

// --- SSE Real-time Sync ---

interface SyncEvent {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: Record<string, unknown>;
  deviceId: string;
  createdAt: { wall: number; counter: number; node: string };
}

function compareHLC(
  a: { wall: number; counter: number; node: string },
  b: { wall: number; counter: number; node: string },
): -1 | 0 | 1 {
  if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.node !== b.node) return a.node < b.node ? -1 : 1;
  return 0;
}

let sseSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

function startPolling(): void {
  if (pollTimer) return;
  console.log('[sync] Starting polling fallback');
  pollTimer = setInterval(() => {
    pollEvents().catch((err) => console.error('[sync] Poll error:', err));
  }, 30000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!started) return;
  if (reconnectTimer) return;

  startPolling();

  console.log(`[sync] Reconnecting in ${reconnectDelay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSSE();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
}

async function applyRemoteEvent(event: SyncEvent): Promise<void> {
  const { table, operation, recordId, payload } = event;

  // Only handle tables that exist in the expo-app
  if (table !== 'todo' && table !== 'pluse' && table !== 'timerSession') {
    return;
  }

  const tableMap = {
    todo: schema.todos,
    pluse: schema.pluses,
    timerSession: schema.timerSessions,
  } as const;

  const drizzleTable = tableMap[table as keyof typeof tableMap];
  if (!drizzleTable) return;

  try {
    if (operation === 'delete') {
      await db.delete(drizzleTable).where(eq(drizzleTable.id, recordId));
      console.log(`[sync] Applied delete: ${table}/${recordId}`);
      if (table === 'todo') queryClient.invalidateQueries({ queryKey: ['todos'] });
      else if (table === 'pluse') queryClient.invalidateQueries({ queryKey: ['pluses'] });
      else if (table === 'timerSession') queryClient.invalidateQueries({ queryKey: ['timerSessions'] });
      return;
    }

    if (!payload) return;

    // Convert ISO date strings back to text fields
    const data: Record<string, unknown> = { ...payload };
    for (const key of Object.keys(data)) {
      if (typeof data[key] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(data[key] as string)) {
        // Keep as ISO string — the expo-app stores dates as text
      }
    }

    // Build the drizzle-compatible record (keep camelCase — that's what drizzle expects)
    const record: Record<string, unknown> = { id: recordId, ...data };

    // Ensure required NOT NULL fields have proper ISO string values
    const createdAt = record['createdAt'];
    record['createdAt'] = (typeof createdAt === 'string' && createdAt) ? createdAt : new Date().toISOString();
    const updatedAt = record['updatedAt'];
    record['updatedAt'] = (typeof updatedAt === 'string' && updatedAt) ? updatedAt : new Date().toISOString();
    if (table === 'timerSession' && !record['type']) {
      record['type'] = 'pluse';
    }

    console.log(`[sync] Applying ${operation} on ${table}/${recordId}, fields:`, Object.keys(record).join(', '));

    // Check if record exists locally
    const existing = await db.select().from(drizzleTable).where(eq(drizzleTable.id, recordId)).limit(1);

    if (existing.length > 0) {
      // HLC conflict resolution: only adopt if remote is newer
      const remoteHLC = {
        wall: (data.versionWall as number) ?? 0,
        counter: (data.versionCounter as number) ?? 0,
        node: (data.versionNode as string) ?? event.deviceId,
      };
      const localHLC = {
        wall: (existing[0] as any).versionWall ?? 0,
        counter: (existing[0] as any).versionCounter ?? 0,
        node: (existing[0] as any).versionNode ?? '',
      };

      if (compareHLC(remoteHLC, localHLC) <= 0) {
        // Local is newer or same — skip
        return;
      }

      // Remove id from update data (can't update primary key)
      const { id: _, ...updateData } = record;
      await db.update(drizzleTable).set(updateData).where(eq(drizzleTable.id, recordId));
      console.log(`[sync] Applied update: ${table}/${recordId}`);
    } else {
      await db.insert(drizzleTable).values(record as any);
      console.log(`[sync] Applied create: ${table}/${recordId}`);
    }

    // Invalidate react-query caches so the UI refreshes
    if (table === 'todo') {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    } else if (table === 'pluse') {
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
    } else if (table === 'timerSession') {
      queryClient.invalidateQueries({ queryKey: ['timerSessions'] });
    }
  } catch (err) {
    console.error(`[sync] Failed to apply ${operation} on ${table}/${recordId}:`, err);
  }
}

async function pollEvents(): Promise<void> {
  const lastSync = await getLastSyncAt();
  const since = lastSync
    ? lastSync.toISOString()
    : new Date(Date.now() - 86400000).toISOString();

  try {
    const result = await syncFetch('/api/sync/events', {
      method: 'POST',
      body: JSON.stringify({ since }),
    });
    if (result.events?.length) {
      for (const event of result.events) {
        await applyRemoteEvent(event as SyncEvent);
      }
    }
    await setLastSyncAt(new Date());
  } catch (err) {
    console.error('[sync] Poll failed:', err);
  }
}

function connectSSE(): void {
  if (sseSource) return;

  // Gather all async state before connecting
  Promise.all([getSyncConfig(), getDeviceId(), getLastSyncAt()]).then(([config, deviceId, lastSync]) => {
    if (!started) return;
    if (!config?.serverUrl) return;

    const params = new URLSearchParams();
    params.set('deviceId', deviceId);
    if (config.apiToken) {
      params.set('token', config.apiToken);
    }
    if (lastSync) {
      params.set('since', lastSync.toISOString());
    }

    const sseUrl = `${config.serverUrl}/api/sync/stream?${params.toString()}`;
    console.log('[sync] Connecting SSE:', sseUrl);

    try {
      sseSource = new EventSource(sseUrl);
    } catch (err) {
      console.error('[sync] Failed to create EventSource:', err);
      scheduleReconnect();
      return;
    }

    sseSource.addEventListener('message', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'delta' && Array.isArray(data.events)) {
          for (const event of data.events) {
            applyRemoteEvent(event as SyncEvent).catch((err) => {
              console.error('[sync] Failed to apply delta event:', err);
            });
          }
          if (data.events.length > 0) {
            setLastSyncAt(new Date()).catch(() => {});
          }
        } else if (data.type === 'event' && data.event) {
          applyRemoteEvent(data.event as SyncEvent).catch((err) => {
            console.error('[sync] Failed to apply event:', err);
          });
          setLastSyncAt(new Date()).catch(() => {});
        }
      } catch (err) {
        console.error('[sync] Failed to parse SSE message:', err);
      }
    });

    sseSource.addEventListener('open', () => {
      console.log('[sync] SSE connected');
      reconnectDelay = 1000;
      stopPolling();
      setLastSyncAt(new Date()).catch(() => {});
    });

    sseSource.addEventListener('error', () => {
      console.log('[sync] SSE connection error');
      sseSource?.close();
      sseSource = null;
      scheduleReconnect();
    });
  }).catch((err) => {
    console.error('[sync] Failed to initialize SSE:', err);
    scheduleReconnect();
  });
}

export function startSync(): void {
  if (started) return;
  started = true;
  console.log('[sync] Starting real-time sync');
  connectSSE();
}

export function stopSync(): void {
  started = false;
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPolling();
  console.log('[sync] Stopped real-time sync');
}
