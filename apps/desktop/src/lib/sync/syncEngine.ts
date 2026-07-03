import { TauriSyncHandler } from './sync-handler.js';
import { getSyncConfig } from '../../db/sync.js';
import { platform } from '@tauri-apps/plugin-os';
import { makeDeviceId, type EndType } from '@utral/sync-share';

// --- Window Event Emitter ---

class WindowEventEmitter {
  emitRemoteApplied(table: string, operation: string, recordId: string): void {
    window.dispatchEvent(
      new CustomEvent('db:changed', { detail: { table, operation, recordId } })
    );
  }
}

// --- Singleton Engine ---

let engine: TauriSyncHandler | null = null;

function normalizeServerUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getWsUrl(httpUrl: string): string {
  // Convert http:// to ws:// and https:// to wss://
  return httpUrl.replace(/^http/, 'ws');
}

// The server mounts the sync WebSocket at this path (see apps/server/src/index.ts).
const SYNC_WS_PATH = '/ws/sync';

function withSyncPath(wsUrl: string): string {
  return wsUrl.includes(SYNC_WS_PATH) ? wsUrl : wsUrl + SYNC_WS_PATH;
}

// --- Device ID ---

const DEVICE_ID_KEY = 'syncDeviceId';

/**
 * Return this device's stable id, generating and persisting one on first use.
 * Used both as the HLC node id for local writes and as the sync connection's
 * deviceId, so it must be stable across launches and independent of whether sync
 * is configured. The id is `${endType}-${uuid}` (see `makeDeviceId`); on the
 * desktop the Tauri OS plugin resolves `endType` to "linux" on Linux and
 * "desktop" on macOS/Windows. Existing ids are never reformatted — the node id
 * is baked into the HLC version of records this device has already written.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    const endType: EndType = platform() === 'linux' ? 'linux' : 'desktop';
    id = makeDeviceId(endType);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function getEngine(): Promise<TauriSyncHandler> {

  if (!engine) {
    const config = await getSyncConfig();
    const serverUrl = config?.serverUrl ? withSyncPath(getWsUrl(normalizeServerUrl(config.serverUrl))) : undefined;
    

    engine = new TauriSyncHandler({
      serverUrl,
      deviceId: await getOrCreateDeviceId(),
      userId: config.userId || 'default',
      channel: config.channel || 'default',
      emitter: new WindowEventEmitter(),
    });
    if(config ){
      await engine.init().catch((err) => {
        console.error('Failed to initialize sync engine:', err);
      });
    }


 
  }
  return engine;
}

// --- Public API (same as before) ---

export async function notifyDbOperation(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string
): Promise<void> {
  debugger
  const engine = await getEngine();
  window.dispatchEvent(
    new CustomEvent('db:changed', { detail: { table, operation, recordId } })
  );

  return engine.syncLocalChange(table, operation, recordId);
}

export async function processQueue(): Promise<void> {
  const engine = await getEngine();
  return engine.forceSync();
}

export async function start(): Promise<void> {
  const engine = await getEngine();
  return engine.connect();
}

export function stop(): void {
  if (engine) {
    engine.disconnect();
    engine = null;
  }
}

export function getSyncStatus(): { connected: boolean; pendingCount: number } {
  if (!engine) {
    return { connected: false, pendingCount: 0 };
  }
  return {
    connected: engine.state === 'connected',
    pendingCount: 0,
  };
}
