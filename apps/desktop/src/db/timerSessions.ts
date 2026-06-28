import { db } from './drizzle-adapter';
import { pluses } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Pluse } from '../types';
import { pluseToRow, rowToPluse } from './schema';

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
    timer_status: 'running',
    started_at: new Date(),
    accumulated_seconds: 0,
    current_interval_index: 0,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(pluses.id, pluseId));
  onLocalChange('pluses', 'update', pluseId).catch(() => {});
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
    timer_status: 'paused',
    started_at: null,
    accumulated_seconds: accumulatedSeconds,
    current_interval_index: currentIntervalIndex,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(pluses.id, pluseId));
  onLocalChange('pluses', 'update', pluseId).catch(() => {});
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
    timer_status: 'running',
    started_at: new Date(),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(pluses.id, pluseId));
  onLocalChange('pluses', 'update', pluseId).catch(() => {});
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
    timer_status: 'idle',
    started_at: null,
    accumulated_seconds: 0,
    current_interval_index: 0,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(pluses.id, pluseId));
  onLocalChange('pluses', 'update', pluseId).catch(() => {});
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
    current_interval_index: currentIntervalIndex,
    accumulated_seconds: 0,
    started_at: new Date(),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(pluses.id, pluseId));
  onLocalChange('pluses', 'update', pluseId).catch(() => {});
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
