import { ExpoSyncHandler } from './sync/sync-handler';
import * as SQLite from 'expo-sqlite';
import { db, schema } from '../db';
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

// --- Sync Engine ---

const TABLE_NAME_MAP: Record<string, string> = {
  todos: 'todo',
  relations: 'todoRelation',
  todoLogs: 'todoLog',
  actionEdges: 'actionEdge',
  plans: 'plan',
  pluses: 'pluse',
  repeatOccurrences: 'repeatOccurrence',
  timeSlots: 'timeSlot',
};

const TABLE_ORDER: Record<string, number> = {
  todos: 0, todo: 0,
  relations: 1, todoRelation: 1,
  todoLogs: 2, todoLog: 2,
  actionEdges: 3, actionEdge: 3,
  pluses: 4, pluse: 4,
  repeatOccurrences: 5, repeatOccurrence: 5,
  plans: 6, plan: 6,
  timeSlots: 7, timeSlot: 7,
};

function normalizeServerUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws');
}

// --- Singleton Engine ---

let engine: ExpoSyncHandler | null = null;

async function getEngine(): Promise<ExpoSyncHandler> {
  if (!engine) {
    const config = await getSyncConfig();
    if (!config?.serverUrl) {
      throw new Error('Sync not configured');
    }

    const serverUrl = getWsUrl(normalizeServerUrl(config.serverUrl));
    const deviceId = await getDeviceId();

    engine = new ExpoSyncHandler({
      serverUrl,
      tables: Object.values(TABLE_NAME_MAP),
      tableOrder: TABLE_ORDER,
      deviceId,
      userId: (config as any).userId || 'default',
      channel: (config as any).channel || 'default',
      emitter: {
        emitRemoteApplied: (table: string, operation: string, recordId: string) => {
          // Invalidate react-query caches so the UI refreshes
          if (table === 'todo') {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
          } else if (table === 'pluse') {
            queryClient.invalidateQueries({ queryKey: ['pluses'] });
          } else if (table === 'timeSlot') {
            queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
            queryClient.invalidateQueries({ queryKey: ['todos'] });
          }
        },
      },
    });

    await engine.init();
  }
  return engine;
}

// --- Public API ---

export async function syncAll(): Promise<void> {
  console.log('[sync] syncAll');
  const engine = await getEngine();
  await engine.connect();
}

let sseSource: any = null;
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

async function applyRemoteEvent(event: any): Promise<void> {
  const { table, operation, recordId, payload } = event;

  // Only handle tables that exist in the expo-app
  if (table !== 'todo' && table !== 'pluse' && table !== 'timeSlot') {
    return;
  }

  const tableMap = {
    todo: schema.todos,
    pluse: schema.pluses,
    timeSlot: schema.timeSlots,
  } as const;

  const drizzleTable = tableMap[table as keyof typeof tableMap];
  if (!drizzleTable) return;

  try {
    if (operation === 'delete') {
      await db.delete(drizzleTable).where((drizzleTable as any).id.eq(recordId));
      console.log(`[sync] Applied delete: ${table}/${recordId}`);
      if (table === 'todo') queryClient.invalidateQueries({ queryKey: ['todos'] });
      else if (table === 'pluse') queryClient.invalidateQueries({ queryKey: ['pluses'] });
      else if (table === 'timeSlot') {
        queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
        queryClient.invalidateQueries({ queryKey: ['todos'] });
      }
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

    console.log(`[sync] Applying ${operation} on ${table}/${recordId}, fields:`, Object.keys(record).join(', '));

    // Check if record exists locally
    const existing = await db.select().from(drizzleTable).where((drizzleTable as any).id.eq(recordId)).limit(1);

    if (existing.length > 0) {
      // Remove id from update data (can't update primary key)
      const { id: _, ...updateData } = record;
      await db.update(drizzleTable).set(updateData).where((drizzleTable as any).id.eq(recordId));
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
    } else if (table === 'timeSlot') {
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
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
    const config = await getSyncConfig();
    if (!config?.serverUrl) return;

    const response = await fetch(`${config.serverUrl}/api/sync/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiToken ? { 'Authorization': `Bearer ${config.apiToken}` } : {}),
      },
      body: JSON.stringify({ since }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.events?.length) {
      for (const event of result.events) {
        await applyRemoteEvent(event);
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
      // Use EventSource from react-native-sse
      const EventSource = require('react-native-sse').default;
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
            applyRemoteEvent(event).catch((err) => {
              console.error('[sync] Failed to apply delta event:', err);
            });
          }
          if (data.events.length > 0) {
            setLastSyncAt(new Date()).catch(() => {});
          }
        } else if (data.type === 'event' && data.event) {
          applyRemoteEvent(data.event).catch((err) => {
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
