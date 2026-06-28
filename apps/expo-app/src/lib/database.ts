import { eq, and, isNull } from 'drizzle-orm';
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

export interface ActiveTimerState {
  pluseId: string;
  currentIntervalIndex: number;
  accumulatedSeconds: number;
  isRunning: boolean;
}

let activeTimerState: ActiveTimerState | null = null;

export async function setActiveTimerState(state: ActiveTimerState | null) {
  activeTimerState = state;
}

export async function getActiveTimerState(): Promise<ActiveTimerState | null> {
  return activeTimerState;
}

export interface HLCState {
  counter: number;
  node: string;
  lastSeen: number;
}

export async function getSyncConfigData(): Promise<SyncConfig | null> {
  const rows = await db.select().from(schema.syncConfig).limit(1);
  if (rows.length === 0) return null;
  return { serverUrl: rows[0].serverUrl, apiToken: rows[0].apiToken || undefined };
}

export async function setSyncConfigData(config: SyncConfig): Promise<void> {
  await db
    .insert(schema.syncConfig)
    .values({ id: 'default', serverUrl: config.serverUrl, apiToken: config.apiToken || null })
    .onConflictDoUpdate({
      target: schema.syncConfig.id,
      set: { serverUrl: config.serverUrl, apiToken: config.apiToken || null },
    });
}

export async function getHLCState(): Promise<HLCState> {
  const rows = await db.select().from(schema.hlcState).limit(1);
  if (rows.length > 0) {
    return { counter: rows[0].counter, node: rows[0].node, lastSeen: rows[0].lastSeen };
  }
  const defaultState = { counter: 0, node: Math.random().toString(36).slice(2, 10), lastSeen: Date.now() };
  await db.insert(schema.hlcState).values({ id: 'default', ...defaultState }).onConflictDoNothing();
  const rows2 = await db.select().from(schema.hlcState).limit(1);
  if (rows2.length > 0) {
    return { counter: rows2[0].counter, node: rows2[0].node, lastSeen: rows2[0].lastSeen };
  }
  return defaultState;
}

export async function setHLCState(state: HLCState): Promise<void> {
  await db
    .insert(schema.hlcState)
    .values({ id: 'default', ...state })
    .onConflictDoUpdate({
      target: schema.hlcState.id,
      set: { counter: state.counter, node: state.node, lastSeen: state.lastSeen },
    });
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
        isNull(schema.pluses.deletedAtWall),
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
        isNull(schema.pluses.deletedAtWall),
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
