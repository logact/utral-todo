import { db } from './database';
import { getSyncConfig } from './sync';
import type { SyncEvent } from '../types';

let tauriFetch: typeof fetch | null = null;

async function resolveFetch(): Promise<typeof fetch> {
  if (tauriFetch) return tauriFetch;

  // Only use Tauri HTTP plugin when actually running inside Tauri.
  // In a plain browser (Vite dev server), the plugin's fetch() calls
  // invoke() internally, which is undefined and throws.
  const hasTauri = typeof window !== 'undefined' &&
    !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

  if (hasTauri) {
    try {
      const tauriHttp = await import('@tauri-apps/plugin-http');
      tauriFetch = tauriHttp.fetch;
      console.log('[sync] Using Tauri HTTP plugin');
      return tauriFetch;
    } catch (err) {
      console.warn('[sync] Tauri HTTP plugin unavailable, falling back to native fetch:', err);
      // fall through to native fetch
    }
  }

  return fetch.bind(globalThis);
}

let sseSource: EventSource | null = null;
let processing = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let deviceId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

function normalizeServerUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

async function getOrCreateDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const state = await db.syncState.get('deviceId');
  if (state?.value) {
    deviceId = state.value;
    return deviceId;
  }
  // On iOS, use the native deviceId so APNS silent pushes route correctly
  const bridge = (window as unknown as Record<string, unknown>).__bridge__ as
    | { platform?: string; call?: (module: string, action: string) => Promise<string> }
    | undefined;
  if (bridge?.platform === 'ios' && bridge.call) {
    try {
      const nativeId = await bridge.call('sync', 'getDeviceId');
      await db.syncState.put({ key: 'deviceId', value: nativeId });
      deviceId = nativeId;
      return deviceId;
    } catch {
      // Fall through to random UUID
    }
  }

  const newId = crypto.randomUUID();
  await db.syncState.put({ key: 'deviceId', value: newId });
  deviceId = newId;
  return newId;
}

async function getLastSyncAt(): Promise<Date | undefined> {
  const state = await db.syncState.get('lastSyncAt');
  if (state?.value) return new Date(state.value);
  return undefined;
}

async function setLastSyncAt(date: Date): Promise<void> {
  await db.syncState.put({ key: 'lastSyncAt', value: date.toISOString() });
}

async function syncFetch(path: string, options?: RequestInit): Promise<Response> {
  const config = getSyncConfig();
  if (!config) throw new Error('Sync not configured');

  const url = normalizeServerUrl(config.serverUrl);
  const fullUrl = `${url}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  const doFetch = await resolveFetch();
  const method = options?.method || 'GET';
  console.log(`[sync] ${method} ${fullUrl}`);
  const res = await doFetch(fullUrl, {
    headers,
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[sync] ${method} ${fullUrl} failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

export async function applyRemoteEvent(event: SyncEvent): Promise<void> {
  const payload = event.payload as Record<string, unknown> | undefined;

  // Parse dates in payload
  const parsed = payload ? { ...payload } : undefined;
  if (parsed) {
    for (const key of Object.keys(parsed)) {
      const val = parsed[key];
      if (typeof val === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
        parsed[key] = new Date(val);
      }
    }
  }

  if (event.operation === 'delete') {
    switch (event.table) {
      case 'todo': await db.todos.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete todo:', event.recordId, err)); break;
      case 'todoRelation': await db.relations.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete relation:', event.recordId, err)); break;
      case 'todoLog': await db.todoLogs.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete log:', event.recordId, err)); break;
      case 'actionEdge': await db.actionEdges.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete actionEdge:', event.recordId, err)); break;
      case 'plan': await db.plans.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete plan:', event.recordId, err)); break;
      case 'pluse': await db.pluses.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete pluse:', event.recordId, err)); break;
      case 'timerSession': await db.timerSessions.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete timerSession:', event.recordId, err)); break;
      case 'repeatOccurrence': await db.repeatOccurrences.delete(event.recordId).catch((err) => console.warn('[sync] Failed to delete repeatOccurrence:', event.recordId, err)); break;
      default: console.warn('[sync] Unknown table:', event.table);
    }
    return;
  }

  if (!parsed) return;

  const parsedEvent = parsed;

  async function applyToTable(
    table: { get(id: string): Promise<unknown>; add(item: unknown): Promise<unknown>; update(id: string, changes: unknown): Promise<number> }
  ): Promise<void> {
    const local = await table.get(event.recordId) as Record<string, unknown> | undefined;
    if (!local) {
      await table.add(parsedEvent).catch((err: unknown) => {
        console.warn(`[sync] Failed to add remote ${event.table} (${event.recordId}):`, err);
      });
      return;
    }

    const localUpdatedAt = local.updatedAt as Date | undefined;
    const remoteUpdatedAt = parsedEvent.updatedAt as Date | undefined;

    if (remoteUpdatedAt && localUpdatedAt) {
      const remoteTime = new Date(remoteUpdatedAt).getTime();
      const localTime = new Date(localUpdatedAt).getTime();
      if (remoteTime > localTime) {
        await table.update(event.recordId, parsedEvent).catch((err: unknown) => {
          console.warn(`[sync] Failed to update remote ${event.table} (${event.recordId}):`, err);
        });
      }
    } else {
      await table.update(event.recordId, parsedEvent).catch((err: unknown) => {
        console.warn(`[sync] Failed to update remote ${event.table} (${event.recordId}):`, err);
      });
    }
  }

  switch (event.table) {
    case 'todo': await applyToTable(db.todos as never); break;
    case 'todoRelation': await applyToTable(db.relations as never); break;
    case 'todoLog': await applyToTable(db.todoLogs as never); break;
    case 'actionEdge': await applyToTable(db.actionEdges as never); break;
    case 'plan': await applyToTable(db.plans as never); break;
    case 'pluse': await applyToTable(db.pluses as never); break;
    case 'timerSession': await applyToTable(db.timerSessions as never); break;
    case 'repeatOccurrence': await applyToTable(db.repeatOccurrences as never); break;
    default: console.warn('[sync] Unknown table:', event.table);
  }

  window.dispatchEvent(new CustomEvent('sync:remote-applied', { detail: { table: event.table, operation: event.operation, recordId: event.recordId } }));
}

export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const config = getSyncConfig();
    if (!config?.serverUrl) {
      processing = false;
      return;
    }

    const myDeviceId = await getOrCreateDeviceId();
    const items = await db.syncQueue.orderBy('createdAt').toArray();
    if (items.length === 0) {
      processing = false;
      return;
    }

    // Sort items to ensure correct order: todos before todoRelations,
    // todoRelations before todoLogs, etc. This prevents foreign key violations.
    const tableOrder: Record<string, number> = {
      todos: 0,
      todo: 0,
      relations: 1,
      todoRelation: 1,
      todoLogs: 2,
      todoLog: 2,
      actionEdges: 3,
      actionEdge: 3,
      pluses: 4,
      pluse: 4,
      timerSessions: 5,
      timerSession: 5,
      repeatOccurrences: 6,
      repeatOccurrence: 6,
      plans: 7,
      plan: 7,
    };
    items.sort((a, b) => {
      const orderA = tableOrder[a.table] ?? 99;
      const orderB = tableOrder[b.table] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      // Within same table, process deletes first, then creates/updates by createdAt
      if (a.operation === 'delete' && b.operation !== 'delete') return -1;
      if (a.operation !== 'delete' && b.operation === 'delete') return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Batch into chunks of 50
    const batchSize = 50;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const changes: SyncEvent[] = [];

      for (const item of batch) {
        if (item.operation === 'delete') {
          changes.push({
            id: item.id,
            table: item.table,
            operation: item.operation,
            recordId: item.recordId,
            deviceId: myDeviceId,
            createdAt: item.createdAt,
          });
        } else {
          const getRecord = async (): Promise<unknown | undefined> => {
            switch (item.table) {
              case 'todos': return db.todos.get(item.recordId);
              case 'relations': return db.relations.get(item.recordId);
              case 'todoLogs': return db.todoLogs.get(item.recordId);
              case 'actionEdges': return db.actionEdges.get(item.recordId);
              case 'plans': return db.plans.get(item.recordId);
              case 'pluses': return db.pluses.get(item.recordId);
              case 'timerSessions': return db.timerSessions.get(item.recordId);
              case 'repeatOccurrences': return db.repeatOccurrences.get(item.recordId);
              default: return undefined;
            }
          };
          const record = await getRecord();
          if (!record) continue;

          // Serialize dates
          const payload = JSON.parse(JSON.stringify(record));

          changes.push({
            id: item.id,
            table: item.table === 'todos' ? 'todo' :
                   item.table === 'relations' ? 'todoRelation' :
                   item.table === 'todoLogs' ? 'todoLog' :
                   item.table === 'actionEdges' ? 'actionEdge' :
                   item.table === 'plans' ? 'plan' :
                   item.table === 'pluses' ? 'pluse' :
                   item.table === 'timerSessions' ? 'timerSession' :
                   item.table === 'repeatOccurrences' ? 'repeatOccurrence' : item.table,
            operation: item.operation,
            recordId: item.recordId,
            payload,
            deviceId: myDeviceId,
            createdAt: item.createdAt,
          });
        }
      }

      if (changes.length === 0) {
        for (const item of batch) {
          await db.syncQueue.delete(item.id);
        }
        continue;
      }

      try {
        const res = await syncFetch('/api/sync/push', {
          method: 'POST',
          body: JSON.stringify({ deviceId: myDeviceId, changes }),
        });
        const result = await res.json() as { accepted: number; rejected?: Array<{ recordId: string; reason: string }> };

        if (result.rejected?.length) {
          console.warn('[sync] Some changes rejected:', result.rejected);
        }

        // Remove successfully processed items from queue
        for (const item of batch) {
          await db.syncQueue.delete(item.id);
        }

        await setLastSyncAt(new Date());
      } catch (err) {
        console.error('[sync] Push failed:', err);
        // Increment retry count for all items in batch
        for (const item of batch) {
          const newRetry = (item.retryCount || 0) + 1;
          if (newRetry >= 5) {
            console.error(`[sync] Dropping queue item after 5 retries: ${item.table}/${item.recordId}`);
            await db.syncQueue.delete(item.id);
          } else {
            await db.syncQueue.update(item.id, {
              retryCount: newRetry,
              lastError: err instanceof Error ? err.message : String(err),
            });
          }
        }
        break; // Stop processing more batches on error
      }
    }
  } finally {
    processing = false;
  }
}

function connectSSE(): void {
  if (sseSource) return; // Already connected or connecting

  const config = getSyncConfig();
  if (!config?.serverUrl) return;

  const url = normalizeServerUrl(config.serverUrl);
  const myDeviceId = deviceId;
  if (!myDeviceId) return;

  const params = new URLSearchParams();
  params.set('deviceId', myDeviceId);
  if (config.apiToken) {
    params.set('token', config.apiToken);
  }

  getLastSyncAt().then((lastSync) => {
    if (lastSync) {
      params.set('since', lastSync.toISOString());
    }

    const sseUrl = `${url}/api/sync/stream?${params.toString()}`;
    console.log('[sync] Connecting SSE:', sseUrl);

    try {
      sseSource = new EventSource(sseUrl);
    } catch (err) {
      console.error('[sync] Failed to create EventSource:', err);
      scheduleReconnect();
      return;
    }

    sseSource.onmessage = (e) => {
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
    };

    sseSource.onopen = () => {
      console.log('[sync] SSE connected');
      reconnectDelay = 1000;
      stopPolling();
      setLastSyncAt(new Date()).catch(() => {});
      // Process any queued changes
      processQueue().catch(() => {});
    };

    sseSource.onerror = () => {
      const wasConnected = sseSource?.readyState === EventSource.OPEN;
      sseSource = null;
      if (wasConnected) {
        console.log('[sync] SSE connection closed');
      }
      scheduleReconnect();
    };
  }).catch((err) => {
    console.error('[sync] Failed to get lastSyncAt:', err);
    scheduleReconnect();
  });
}

async function pollEvents(): Promise<void> {
  const lastSync = await getLastSyncAt();
  // If never synced, poll for events from the last 24 hours
  const since = lastSync ? lastSync.toISOString() : new Date(Date.now() - 86400000).toISOString();

  try {
    const res = await syncFetch('/api/sync/events', {
      method: 'POST',
      body: JSON.stringify({ since }),
    });
    const result = await res.json() as { events: SyncEvent[] };
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

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    pollEvents().catch(() => {});
  }, 30000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!started) return; // Don't reconnect if intentionally stopped
  if (reconnectTimer) return;
  startPolling();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSSE();
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }, reconnectDelay);
}

export async function onLocalChange(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string
): Promise<void> {
  await db.syncQueue.add({
    id: crypto.randomUUID(),
    table,
    operation,
    recordId,
    createdAt: new Date(),
    retryCount: 0,
  });

  // Notify any mounted React hooks/pages that local data changed
  window.dispatchEvent(
    new CustomEvent('db:changed', { detail: { table, operation, recordId } })
  );

  // Debounce queue processing
  setTimeout(() => {
    processQueue().catch(() => {});
  }, 100);
}

export async function start(): Promise<void> {
  if (started) return;
  started = true;
  await getOrCreateDeviceId();
  window.removeEventListener('nativeSyncTrigger', onNativeSyncTrigger);
  window.addEventListener('nativeSyncTrigger', onNativeSyncTrigger);
  connectSSE();
}

export function stop(): void {
  started = false;
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = 1000;
  stopPolling();
}

function onNativeSyncTrigger() {
  console.log('[sync] Native sync trigger received');
  processQueue().catch(() => {});
  pollEvents().catch(() => {});
}

export function getSyncStatus(): { connected: boolean; pendingCount: number } {
  return {
    connected: sseSource?.readyState === EventSource.OPEN,
    pendingCount: 0, // Will be updated by caller
  };
}
