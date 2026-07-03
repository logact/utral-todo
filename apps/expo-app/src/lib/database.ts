import { eq } from 'drizzle-orm';
import { Platform } from 'react-native';
import { makeDeviceId, type EndType } from '@utral/sync-share';
import { db, expoDb, schema } from '../db';
import { queryClient } from './query-client';
import { initDbStore, getDbStore } from './db-store';
import { bootstrapApp, type BootstrapStore } from '@utral/db-schema/bootstrap';
import type { SyncConfig, Todo, Pluse, TodoStatus } from '@utral/types';

export type { Todo, Pluse, TodoStatus, SyncConfig };

export interface HLCState {
  counter: number;
  node: string;
  lastSeen: number;
}

// ─── Key/value helpers for the shared KV-shaped infra tables ───

async function getConfigValue(key: string): Promise<string | undefined> {
  const rows = await db.select().from(schema.syncConfig).where(eq(schema.syncConfig.key, key)).limit(1);
  return rows[0]?.value;
}

async function setConfigValue(key: string, value: string): Promise<void> {
  await db.insert(schema.syncConfig).values({ key, value })
    .onConflictDoUpdate({ target: schema.syncConfig.key, set: { value } });
}

async function getHlcValue(key: string): Promise<string | undefined> {
  const rows = await db.select().from(schema.hlcState).where(eq(schema.hlcState.key, key)).limit(1);
  return rows[0]?.value;
}

async function setHlcValue(key: string, value: string): Promise<void> {
  await db.insert(schema.hlcState).values({ key, value })
    .onConflictDoUpdate({ target: schema.hlcState.key, set: { value } });
}

export async function getSyncConfigData(): Promise<SyncConfig> {
  const serverUrl = await getConfigValue('server_url');
  const apiToken = await getConfigValue('api_token');
  return { serverUrl: serverUrl ?? '', apiToken: apiToken || undefined };
}

export async function setSyncConfigData(config: SyncConfig): Promise<void> {
  await setConfigValue('server_url', config.serverUrl);
  await setConfigValue('api_token', config.apiToken || '');
}

export function getDatabasePath(): string {
  return expoDb.databasePath;
}

export async function getHLCState(): Promise<HLCState> {
  debugger
  const node = await getHlcValue('node');
  if (node !== undefined && node !== '') {
    return {
      counter: Number(await getHlcValue('counter') ?? 0),
      node,
      lastSeen: Number(await getHlcValue('lastSeen') ?? 0),
    };
  }
  // First run on this install: mint a stable `${endType}-${uuid}` device id that
  // doubles as the HLC node. On mobile the end-type comes straight from
  // Platform.OS (ios/android); anything else falls back to "desktop".
  const endType: EndType = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'desktop';
  const defaultState = { counter: 0, node: makeDeviceId(endType), lastSeen: Date.now() };
  await setHLCState(defaultState);
  return defaultState;
}

export async function setHLCState(state: HLCState): Promise<void> {
  await setHlcValue('node', state.node);
  await setHlcValue('counter', String(state.counter));
  await setHlcValue('lastSeen', String(state.lastSeen));
}
let _cacheDeviceId: string  = '';
export async function getDeviceId(): Promise<string> {
  const state = await getHLCState();
  _cacheDeviceId = state.node;
  return state.node;
}
export  function getDeviceIdSync(): string {
  if (!_cacheDeviceId) {
    throw new Error('Device ID not initialized yet. Call getDeviceId() first.');
  }
  return _cacheDeviceId;
}

export async function getLastSyncAt(): Promise<Date | undefined> {
  const state = await getHLCState();
  if (state.lastSeen === 0) return undefined;
  return new Date(state.lastSeen);
}

export async function setLastSyncAt(date: Date): Promise<void> {
  const state = await getHLCState();
  await setHLCState({ ...state, lastSeen: date.getTime() });
}

export async function initDatabase(): Promise<void> {
  const deviceId = await getDeviceId();
  initDbStore(deviceId);

  const store: BootstrapStore = {
    ...getDbStore(),
    onComplete: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
    },
  };

  await bootstrapApp(store);
}

export async function clearAllData(): Promise<void> {
  expoDb.execSync('DELETE FROM todos');
  expoDb.execSync('DELETE FROM todo_relations');
  expoDb.execSync('DELETE FROM todo_logs');
  expoDb.execSync('DELETE FROM action_edges');
  expoDb.execSync('DELETE FROM plans');
  expoDb.execSync('DELETE FROM pluses');
  expoDb.execSync('DELETE FROM repeat_occurrences');
  expoDb.execSync('DELETE FROM time_slots');
  expoDb.execSync('DELETE FROM sync_config');
  expoDb.execSync('DELETE FROM hlc_state');
  expoDb.execSync('DELETE FROM sync_queue');
  expoDb.execSync('DELETE FROM sync_state');
}

export async function resetAllData(): Promise<void> {
  // Stop sync first so no queued operations are sent while we wipe.
  const { stopSync } = await import('./sync');
  stopSync();

  // Clear every local table (domain + sync infra).
  await clearAllData();

  // Clear React Query cache so stale data doesn't reappear in the UI.
  queryClient.clear();
}
