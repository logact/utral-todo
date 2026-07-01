import { TauriSyncHandler } from './sync-handler.js';
import { getSyncConfig } from '../../db/sync.js';

// Table name mapping: Dexie store names → SyncEvent canonical names
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

async function getEngine(): Promise<TauriSyncHandler> {
  if (!engine) {
    const config = getSyncConfig();
    if (!config?.serverUrl) {
      throw new Error('Sync not configured');
    }

    const serverUrl = getWsUrl(normalizeServerUrl(config.serverUrl));

    engine = new TauriSyncHandler({
      serverUrl,
      tables: Object.values(TABLE_NAME_MAP),
      tableOrder: TABLE_ORDER,
      deviceId: crypto.randomUUID(),
      userId: config.userId || 'default',
      channel: config.channel || 'default',
      emitter: new WindowEventEmitter(),
    });

    await engine.init();
  }
  return engine;
}

// --- Public API (same as before) ---

export async function getOrCreateDeviceId(): Promise<string> {
  const engine = await getEngine();
  return engine.state;
}

export async function syncLocalChange(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string
): Promise<void> {
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
