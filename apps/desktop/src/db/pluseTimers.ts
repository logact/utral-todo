import { db } from './drizzle-adapter';
import { pluses } from './schema';
import { eq } from 'drizzle-orm';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Pluse } from '../types';
import { rowToPluse } from './schema';

export async function getActivePluseTimer(): Promise<Pluse | undefined> {
  const rows = await db.select().from(pluses).where(eq(pluses.timerStatus, 'running')) as any[];
  if (rows.length > 0) return rowToPluse(rows[0]);
  const paused = await db.select().from(pluses).where(eq(pluses.timerStatus, 'paused')) as any[];
  return paused.length > 0 ? rowToPluse(paused[0]) : undefined;
}

export async function startPluseTimer(pluseId: string): Promise<Pluse> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(pluses).set({
    timerStatus: 'running',
    startedAt: new Date(),
    accumulatedSeconds: 0,
    currentIntervalIndex: 0,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(pluses.id, pluseId));
  syncLocalChange('pluses', 'update', pluseId).catch(() => {});
  const updated = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  return rowToPluse(updated[0]);
}

export async function pausePluseTimer(pluseId: string, accumulatedSeconds: number, currentIntervalIndex: number): Promise<Pluse> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(pluses).set({
    timerStatus: 'paused',
    startedAt: null,
    accumulatedSeconds: accumulatedSeconds,
    currentIntervalIndex: currentIntervalIndex,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(pluses.id, pluseId));
  syncLocalChange('pluses', 'update', pluseId).catch(() => {});
  const updated = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  return rowToPluse(updated[0]);
}

export async function resumePluseTimer(pluseId: string): Promise<Pluse> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(pluses).set({
    timerStatus: 'running',
    startedAt: new Date(),
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(pluses.id, pluseId));
  syncLocalChange('pluses', 'update', pluseId).catch(() => {});
  const updated = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  return rowToPluse(updated[0]);
}

export async function stopPluseTimer(pluseId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(pluses).set({
    timerStatus: 'idle',
    startedAt: null,
    accumulatedSeconds: 0,
    currentIntervalIndex: 0,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(pluses.id, pluseId));
  syncLocalChange('pluses', 'update', pluseId).catch(() => {});
}

export async function advancePluseTimer(pluseId: string, currentIntervalIndex: number): Promise<Pluse> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(pluses).set({
    currentIntervalIndex: currentIntervalIndex,
    accumulatedSeconds: 0,
    startedAt: new Date(),
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(pluses.id, pluseId));
  syncLocalChange('pluses', 'update', pluseId).catch(() => {});
  const updated = await db.select().from(pluses).where(eq(pluses.id, pluseId)) as any[];
  return rowToPluse(updated[0]);
}

export function getElapsedSeconds(pluse: Pluse): number {
  if (pluse.timerStatus === 'running' && pluse.startedAt) {
    const now = Date.now();
    const started = pluse.startedAt instanceof Date ? pluse.startedAt.getTime() : new Date(pluse.startedAt).getTime();
    return pluse.accumulatedSeconds + Math.floor((now - started) / 1000);
  }
  return pluse.accumulatedSeconds;
}
