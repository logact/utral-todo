import { ExpoSyncHandler } from './sync/sync-handler';
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

// The server mounts the sync WebSocket at this path (see apps/server/src/index.ts).
const SYNC_WS_PATH = '/ws/sync';

function withSyncPath(wsUrl: string): string {
  return wsUrl.includes(SYNC_WS_PATH) ? wsUrl : wsUrl + SYNC_WS_PATH;
}

// --- Singleton Engine ---

let engine: ExpoSyncHandler | null = null;

async function getEngine(): Promise<ExpoSyncHandler> {
  if (!engine) {
    const config = await getSyncConfig();
    if (!config?.serverUrl) {
      throw new Error('Sync not configured');
    }

    const serverUrl = withSyncPath(getWsUrl(normalizeServerUrl(config.serverUrl)));
    const deviceId = await getDeviceId();

    engine = new ExpoSyncHandler({
      serverUrl,
      deviceId,
      userId: (config as any).userId || 'default',
      channel: (config as any).channel || 'default',
      apiToken: config.apiToken,
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

export async function notifyDbOperation(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
): Promise<void> {
  try {
    const engine = await getEngine();
    await engine.syncLocalChange(table, operation, recordId);
  } catch (err) {
    // Sync may not be configured yet; don't let sync failures break local writes.
    console.log('[sync] notifyDbOperation skipped:', err);
  }
}

// --- Public API ---

export async function syncAll(): Promise<void> {
  console.log('[sync] syncAll');
  const engine = await getEngine();
  engine.forceSync();

}

let started = false;

export function startSync(): void {
  if (started) return;
  started = true;
  console.log('[sync] Starting real-time sync');
  getEngine()
    .then((engine) => engine.connect())
    .catch((err) => {
      console.error('[sync] Failed to start sync engine:', err);
      started = false;
    });
}

export function stopSync(): void {
  if (!started) return;
  started = false;
  engine?.disconnect();
  console.log('[sync] Stopped real-time sync');
}
