import { db } from './drizzle-adapter';
import { pluses, timerSessions as timerSessionsTable } from './schema';
import { eq, and } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
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
    pluse_id: data.pluseId ?? null,
    todo_id: data.todoId ?? null,
    intervals: data.intervals ?? null,
    repeat_count: data.repeatCount ?? null,
    current_index: data.currentIndex ?? 0,
    elapsed_seconds: data.elapsedSeconds ?? 0,
    status: data.status ?? 'running',
    started_at: data.startedAt ?? null,
    paused_at: null,
    completed_at: null,
    created_at_wall: now.wall,
    created_at_counter: now.counter,
    created_at_node: now.node,
    updated_at_wall: now.wall,
    updated_at_counter: now.counter,
    updated_at_node: now.node,
    is_deleted: false,
  };
  await db.insert(timerSessionsTable).values(row as any);
  onLocalChange('timerSession', 'create', id).catch(() => {});
  return rowToTimerSession(row as any);
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
  const update: Record<string, unknown> = {
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  };
  if (data.status !== undefined) update.status = data.status;
  if (data.startedAt !== undefined) update.started_at = data.startedAt;
  if (data.pausedAt !== undefined) update.paused_at = data.pausedAt;
  if (data.completedAt !== undefined) update.completed_at = data.completedAt;
  if (data.elapsedSeconds !== undefined) update.elapsed_seconds = data.elapsedSeconds;
  if (data.currentIndex !== undefined) update.current_index = data.currentIndex;
  if (data.todoId !== undefined) update.todo_id = data.todoId;
  await db.update(timerSessionsTable).set(update as any).where(eq(timerSessionsTable.id, id));
  onLocalChange('timerSession', 'update', id).catch(() => {});
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
    is_deleted: true,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(timerSessionsTable.id, id));
  onLocalChange('timerSession', 'delete', id).catch(() => {});
}
