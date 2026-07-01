import { eq, and } from 'drizzle-orm';
import { db, expoDb, schema } from '../db';
import { queryClient } from './query-client';
import type { Todo, Pluse, SyncConfig, TodoStatus, PluseTimerStatus } from '@utral/types';

export type { Todo, Pluse, SyncConfig, TodoStatus };

function scheduleSyncPush() {
  import('./auto-sync').then((m) => m.scheduleSyncPush()).catch(() => {});
}

function addPendingChange(table: string, operation: 'create' | 'update' | 'delete', recordId: string, payload?: Record<string, unknown> | null) {
  import('./auto-sync').then((m) => m.addPendingChange(table, operation, recordId, payload)).catch(() => {});
}

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

export async function getSyncConfigData(): Promise<SyncConfig | null> {
  const serverUrl = await getConfigValue('server_url');
  if (serverUrl === undefined) return null;
  const apiToken = await getConfigValue('api_token');
  return { serverUrl, apiToken: apiToken || undefined };
}

export async function setSyncConfigData(config: SyncConfig): Promise<void> {
  await setConfigValue('server_url', config.serverUrl);
  await setConfigValue('api_token', config.apiToken || '');
}

export async function getHLCState(): Promise<HLCState> {
  const node = await getHlcValue('node');
  if (node !== undefined && node !== '') {
    return {
      counter: Number(await getHlcValue('counter') ?? 0),
      node,
      lastSeen: Number(await getHlcValue('lastSeen') ?? 0),
    };
  }
  const defaultState = { counter: 0, node: Math.random().toString(36).slice(2, 10), lastSeen: Date.now() };
  await setHLCState(defaultState);
  return defaultState;
}

export async function setHLCState(state: HLCState): Promise<void> {
  await setHlcValue('node', state.node);
  await setHlcValue('counter', String(state.counter));
  await setHlcValue('lastSeen', String(state.lastSeen));
}

export async function getDeviceId(): Promise<string> {
  const state = await getHLCState();
  return state.node;
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

export async function startPluseTimer(pluseId: string): Promise<Pluse> {
  const now = Date.now();
  const deviceId = await getDeviceId();
  const existing = await db.select().from(schema.pluses).where(eq(schema.pluses.id, pluseId)).limit(1);
  if (existing.length === 0) throw new Error('Pluse not found');
  await db
    .update(schema.pluses)
    .set({
      timerStatus: 'running',
      startedAt: new Date(),
      accumulatedSeconds: 0,
      currentIntervalIndex: 0,
      updatedAtWall: now,
      updatedAtNode: deviceId,
    })
    .where(eq(schema.pluses.id, pluseId));
  addPendingChange('pluse', 'update', pluseId);
  scheduleSyncPush();
  const updated = await db.select().from(schema.pluses).where(eq(schema.pluses.id, pluseId)).limit(1);
  return updated[0] as unknown as Pluse;
}

export async function pausePluseTimer(pluseId: string, accumulatedSeconds: number, currentIntervalIndex: number): Promise<Pluse> {
  const now = Date.now();
  const deviceId = await getDeviceId();
  await db
    .update(schema.pluses)
    .set({
      timerStatus: 'paused',
      startedAt: null,
      accumulatedSeconds,
      currentIntervalIndex,
      updatedAtWall: now,
      updatedAtNode: deviceId,
    })
    .where(eq(schema.pluses.id, pluseId));
  addPendingChange('pluse', 'update', pluseId);
  scheduleSyncPush();
  const updated = await db.select().from(schema.pluses).where(eq(schema.pluses.id, pluseId)).limit(1);
  return updated[0] as unknown as Pluse;
}

export async function resumePluseTimer(pluseId: string): Promise<Pluse> {
  const now = Date.now();
  const deviceId = await getDeviceId();
  await db
    .update(schema.pluses)
    .set({
      timerStatus: 'running',
      startedAt: new Date(),
      updatedAtWall: now,
      updatedAtNode: deviceId,
    })
    .where(eq(schema.pluses.id, pluseId));
  addPendingChange('pluse', 'update', pluseId);
  scheduleSyncPush();
  const updated = await db.select().from(schema.pluses).where(eq(schema.pluses.id, pluseId)).limit(1);
  return updated[0] as unknown as Pluse;
}

export async function stopPluseTimer(pluseId: string): Promise<void> {
  const now = Date.now();
  const deviceId = await getDeviceId();
  await db
    .update(schema.pluses)
    .set({
      timerStatus: 'idle',
      startedAt: null,
      accumulatedSeconds: 0,
      currentIntervalIndex: 0,
      updatedAtWall: now,
      updatedAtNode: deviceId,
    })
    .where(eq(schema.pluses.id, pluseId));
  addPendingChange('pluse', 'update', pluseId);
  scheduleSyncPush();
}

export async function advancePluseTimer(pluseId: string, currentIntervalIndex: number): Promise<Pluse> {
  const now = Date.now();
  const deviceId = await getDeviceId();
  await db
    .update(schema.pluses)
    .set({
      currentIntervalIndex,
      accumulatedSeconds: 0,
      startedAt: new Date(),
      updatedAtWall: now,
      updatedAtNode: deviceId,
    })
    .where(eq(schema.pluses.id, pluseId));
  addPendingChange('pluse', 'update', pluseId);
  scheduleSyncPush();
  const updated = await db.select().from(schema.pluses).where(eq(schema.pluses.id, pluseId)).limit(1);
  return updated[0] as unknown as Pluse;
}

export function getElapsedSeconds(pluse: Pluse): number {
  if (pluse.timerStatus === 'running' && pluse.startedAt) {
    const now = Date.now();
    const started = pluse.startedAt instanceof Date ? pluse.startedAt.getTime() : new Date(pluse.startedAt).getTime();
    return pluse.accumulatedSeconds + Math.floor((now - started) / 1000);
  }
  return pluse.accumulatedSeconds;
}

export async function getActivePluseTimer(): Promise<Pluse | null> {
  const rows = await db
    .select()
    .from(schema.pluses)
    .where(
      and(
        eq(schema.pluses.isDeleted, false),
        eq(schema.pluses.timerStatus, 'running')
      )
    )
    .limit(1);
  if (rows.length > 0) return rows[0] as unknown as Pluse;

  const paused = await db
    .select()
    .from(schema.pluses)
    .where(
      and(
        eq(schema.pluses.isDeleted, false),
        eq(schema.pluses.timerStatus, 'paused')
      )
    )
    .limit(1);
  return paused.length > 0 ? (paused[0] as unknown as Pluse) : null;
}

export async function clearAllData(): Promise<void> {
  expoDb.execSync('DELETE FROM todos');
  expoDb.execSync('DELETE FROM pluses');
  expoDb.execSync('DELETE FROM sync_config');
  expoDb.execSync('DELETE FROM hlc_state');
}
