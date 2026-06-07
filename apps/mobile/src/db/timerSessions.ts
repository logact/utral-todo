import { db } from './database';
import type { TimerSession } from '@utral/types';

let onLocalChangeImpl: ((table: string, operation: 'create' | 'update' | 'delete', recordId: string) => Promise<void>) | null = null;

export function setOnLocalChange(handler: typeof onLocalChangeImpl): void {
  onLocalChangeImpl = handler;
}

export async function triggerSync(table: string, operation: 'create' | 'update' | 'delete', recordId: string): Promise<void> {
  if (onLocalChangeImpl) {
    await onLocalChangeImpl(table, operation, recordId);
  }
}

export async function getTimerSession(id: string): Promise<TimerSession | undefined> {
  return db.timerSessions.get(id);
}

export async function getActiveTimerSession(): Promise<TimerSession | undefined> {
  const sessions = await db.timerSessions
    .where('status')
    .anyOf('running', 'paused')
    .reverse()
    .sortBy('updatedAt');
  return sessions[0];
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
    createdAt: now,
    updatedAt: now,
  };
  await db.timerSessions.add(session);
  await triggerSync('timerSessions', 'create', session.id);
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
  const body: Partial<TimerSession> & { updatedAt: Date } = { updatedAt: new Date() };
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
  await triggerSync('timerSessions', 'update', id);
  const session = await db.timerSessions.get(id);
  if (!session) throw new Error('Timer session not found');
  return session;
}

export async function deleteTimerSession(id: string): Promise<void> {
  await db.timerSessions.delete(id);
  await triggerSync('timerSessions', 'delete', id);
}
