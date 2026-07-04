import { ExpoSyncHandler } from './sync/sync-handler';
import type { SyncClientState } from '@utral/sync-client';
import { emitDbChange } from './sync-notifier';
import {
  getSyncConfigData,
  setSyncConfigData,
  getDeviceId,
  getLastSyncAt,
  setLastSyncAt,
  type SyncConfig,
} from './database';

export async function getSyncConfig(): Promise<SyncConfig> {
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

export function getResolvedSyncUrl(serverUrl: string): string {
  if (!serverUrl.trim()) return '';
  return withSyncPath(getWsUrl(normalizeServerUrl(serverUrl)));
}

// --- Singleton Engine ---

let engine: ExpoSyncHandler | null = null;
let connectionState: SyncClientState = 'idle';

async function getEngine(): Promise<ExpoSyncHandler> {
  if (!engine) {
    let config = await getSyncConfig();
    const serverUrl = config.serverUrl ? withSyncPath(getWsUrl(normalizeServerUrl(config.serverUrl))) : "" ;
    const deviceId = await getDeviceId();

    engine = new ExpoSyncHandler({
      serverUrl,
      deviceId,
      userId: (config as any).userId || 'default',
      channel: (config as any).channel || 'default',
      apiToken: config.apiToken,
      onStateChange: (state: SyncClientState) => {
        connectionState = state;
        console.log(`[sync] state=${state}`);
      },
      emitter: {
        emitRemoteApplied: (table: string, operation: string, recordId: string) => {
          console.log(`[sync] emitRemoteApplied table=${table} op=${operation} id=${recordId}`);
          emitDbChange({ table, operation, recordId });
        },
      },
    });
    if(serverUrl){
      await engine.init();
    }

    
  }
  return engine;
}

export function getSyncStatus(): { connected: boolean; state: SyncClientState } {
  return {
    connected: connectionState === 'connected',
    state: connectionState,
  };
}

export function resetEngine(): void {
  if (engine) {
    engine.disconnect();
    engine = null;
    connectionState = 'idle';
    started = false;
    console.log('[sync] Engine reset');
  }
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
    .then((engine) => {
      console.log('[sync] Engine created, connecting...');
      return engine.connect();
    })
    .then(() => {
      console.log('[sync] Sync connected successfully');
    })
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
