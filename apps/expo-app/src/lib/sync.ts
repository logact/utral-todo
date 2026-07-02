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
