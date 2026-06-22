import { db } from './database';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { TimerSession } from '../types';

export async function getTimerSessions(filters?: { status?: string; type?: string }): Promise<TimerSession[]> {
  let query = db.timerSessions.toCollection();
  if (filters?.status) {
    query = db.timerSessions.where('status').equals(filters.status);
  }
  if (filters?.type) {
    const all = await query.toArray();
    return all.filter((s) => s.type === filters.type);
  }
  return query.toArray();
}

export async function getTimerSession(id: string): Promise<TimerSession | undefined> {
  return db.timerSessions.get(id);
}

export async function createTimerSession(data: {
  type: TimerSession['type'];
  name: string;
  pluseId?: string;
  todoId?: string;
  intervals?: number[];
  repeatCount?: number;
  startedAt?: Date;
  status?: TimerSession['status'];
  currentIndex?: number;
  elapsedSeconds?: number;
}): Promise<TimerSession> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const now = new Date();
  const session: TimerSession = {
    id: crypto.randomUUID(),
    type: data.type,
    name: data.name,
    pluseId: data.pluseId,
    todoId: data.todoId,
    intervals: data.intervals,
    repeatCount: data.repeatCount ?? 1,
    startedAt: data.startedAt ?? now,
    currentIndex: data.currentIndex ?? 0,
    elapsedSeconds: data.elapsedSeconds ?? 0,
    status: data.status ?? 'running',
    createdAt: hlc,
    updatedAt: hlc,
  };
  await db.timerSessions.add(session);
  onLocalChange('timerSessions', 'create', session.id).catch(() => {});
  return session;
}

export async function updateTimerSession(
  id: string,
  data: Partial<{
    name: string;
    pluseId: string | null;
    todoId: string | null;
    intervals: number[] | null;
    repeatCount: number;
    startedAt: Date;
    pausedAt: Date | null;
    completedAt: Date | null;
    currentIndex: number;
    elapsedSeconds: number;
    status: TimerSession['status'];
  }>
): Promise<TimerSession> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await db.timerSessions.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const body: Partial<TimerSession> & { updatedAt: typeof mergedUpdatedAt } = { updatedAt: mergedUpdatedAt };
  if (data.name !== undefined) body.name = data.name;
  if (data.pluseId !== undefined) body.pluseId = data.pluseId ?? undefined;
  if (data.todoId !== undefined) body.todoId = data.todoId ?? undefined;
  if (data.intervals !== undefined) body.intervals = data.intervals ?? undefined;
  if (data.repeatCount !== undefined) body.repeatCount = data.repeatCount;
  if (data.startedAt !== undefined) body.startedAt = data.startedAt;
  if (data.pausedAt !== undefined) body.pausedAt = data.pausedAt ?? undefined;
  if (data.completedAt !== undefined) body.completedAt = data.completedAt ?? undefined;
  if (data.currentIndex !== undefined) body.currentIndex = data.currentIndex;
  if (data.elapsedSeconds !== undefined) body.elapsedSeconds = data.elapsedSeconds;
  if (data.status !== undefined) body.status = data.status;

  await db.timerSessions.update(id, body);
  onLocalChange('timerSessions', 'update', id).catch(() => {});
  const session = await db.timerSessions.get(id);
  if (!session) throw new Error('Timer session not found');
  return session;
}

export async function deleteTimerSession(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await db.timerSessions.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.timerSessions.update(id, { deletedAt: hlc, updatedAt: mergedUpdatedAt });
  onLocalChange('timerSessions', 'delete', id).catch(() => {});
}
