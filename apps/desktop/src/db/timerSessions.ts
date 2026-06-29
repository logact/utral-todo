import { db } from './drizzle-adapter';
import { pluses, timerSessions as timerSessionsTable } from './schema';
import { eq, and } from 'drizzle-orm';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Pluse, TimerSession } from '../types';
import { rowToPluse, rowToTimerSession } from './schema';

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

export async function createTimerSession(data: {
  type: 'stopwatch' | 'pluse';
  name: string;
  pluseId?: string;
  todoId?: string;
  intervals?: number[];
  repeatCount?: number;
  currentIndex?: number;
  elapsedSeconds?: number;
  status?: 'running' | 'paused' | 'completed';
  startedAt?: Date;
}): Promise<TimerSession> {
  const nodeId = await getOrCreateDeviceId();
  const now = newHLC(nodeId);
  const id = crypto.randomUUID();
  const row = {
    id,
    type: data.type,
    name: data.name,
    pluseId: data.pluseId ?? null,
    todoId: data.todoId ?? null,
    intervals: data.intervals ?? null,
    repeatCount: data.repeatCount ?? null,
    currentIndex: data.currentIndex ?? 0,
    elapsedSeconds: data.elapsedSeconds ?? 0,
    status: data.status ?? 'running',
    startedAt: data.startedAt ?? null,
    pausedAt: null,
    completedAt: null,
    createdAtWall: now.wall,
    createdAtCounter: now.counter,
    createdAtNode: now.node,
    updatedAtWall: now.wall,
    updatedAtCounter: now.counter,
    updatedAtNode: now.node,
    isDeleted: false,
  };
  await db.insert(timerSessionsTable).values(row);
  syncLocalChange('timerSession', 'create', id).catch(() => {});
  return {
    id,
    type: data.type,
    name: data.name,
    pluseId: data.pluseId,
    todoId: data.todoId,
    intervals: data.intervals,
    repeatCount: data.repeatCount,
    currentIndex: data.currentIndex ?? 0,
    elapsedSeconds: data.elapsedSeconds ?? 0,
    status: data.status ?? 'running',
    startedAt: data.startedAt,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
}

export async function updateTimerSession(
  id: string,
  data: Partial<{
    status: 'running' | 'paused' | 'completed';
    startedAt: Date | null;
    pausedAt: Date | null;
    completedAt: Date | null;
    elapsedSeconds: number;
    currentIndex: number;
    todoId: string | null;
  }>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(timerSessionsTable).where(eq(timerSessionsTable.id, id)) as any[];
  const existing = rows[0] ? rowToTimerSession(rows[0]) : undefined;
  if (!existing) throw new Error('TimerSession not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(timerSessionsTable).set({
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
    ...(data.status !== undefined && { status: data.status }),
    ...(data.startedAt !== undefined && { startedAt: data.startedAt }),
    ...(data.pausedAt !== undefined && { pausedAt: data.pausedAt }),
    ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
    ...(data.elapsedSeconds !== undefined && { elapsedSeconds: data.elapsedSeconds }),
    ...(data.currentIndex !== undefined && { currentIndex: data.currentIndex }),
    ...(data.todoId !== undefined && { todoId: data.todoId }),
  }).where(eq(timerSessionsTable.id, id));
  syncLocalChange('timerSession', 'update', id).catch(() => {});
}

export async function getTimerSessions(filter?: { type?: 'stopwatch' | 'pluse' }): Promise<TimerSession[]> {
  const conditions = [eq(timerSessionsTable.isDeleted, false)];
  if (filter?.type) {
    conditions.push(eq(timerSessionsTable.type, filter.type));
  }
  const rows = await db.select().from(timerSessionsTable).where(and(...conditions)) as any[];
  return rows.map(rowToTimerSession);
}

export async function deleteTimerSession(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(timerSessionsTable).where(eq(timerSessionsTable.id, id)) as any[];
  const existing = rows[0] ? rowToTimerSession(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(timerSessionsTable).set({
    isDeleted: true,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(timerSessionsTable.id, id));
  syncLocalChange('timerSession', 'delete', id).catch(() => {});
}
