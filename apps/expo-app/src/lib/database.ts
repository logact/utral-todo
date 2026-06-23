import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { todos, pluses, timerSessions } from '../db/schema';

export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface ActiveTimerState {
  pluseId: string;
  currentIndex: number;
  elapsedSeconds: number;
  isRunning: boolean;
}

let activeTimerState: ActiveTimerState | null = null;

export async function setActiveTimerState(state: ActiveTimerState | null) {
  activeTimerState = state;
  // Store in memory only - no persistent storage needed for ephemeral state
}

export async function getActiveTimerState(): Promise<ActiveTimerState | null> {
  return activeTimerState;
}

export type Todo = typeof todos.$inferSelect;
export type Pluse = typeof pluses.$inferSelect;
export type TimerSession = typeof timerSessions.$inferSelect;

export interface SyncConfig {
  serverUrl: string;
  apiToken?: string;
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
  await db.insert(schema.hlcState).values({ id: 'default', ...defaultState });
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

export async function createTimerSession(data: Partial<TimerSession>): Promise<TimerSession> {
  const now = new Date().toISOString();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const session = {
    id,
    pluseId: data.pluseId || null,
    todoId: data.todoId || null,
    name: data.name || '',
    intervals: data.intervals || [],
    repeatCount: data.repeatCount || 1,
    currentIndex: data.currentIndex || 0,
    elapsedSeconds: data.elapsedSeconds || 0,
    status: data.status || 'running' as const,
    startedAt: data.startedAt || now,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.timerSessions).values(session);
  return session as TimerSession;
}

export async function updateTimerSession(
  id: string,
  updates: Partial<TimerSession>
): Promise<TimerSession | null> {
  const existing = await db.select().from(schema.timerSessions).where(eq(schema.timerSessions.id, id)).limit(1);
  if (existing.length === 0) return null;
  const { id: _, createdAt: _c, ...updateFields } = updates as any;
  await db
    .update(schema.timerSessions)
    .set({ ...updateFields, updatedAt: new Date().toISOString() })
    .where(eq(schema.timerSessions.id, id));
  const updated = await db.select().from(schema.timerSessions).where(eq(schema.timerSessions.id, id)).limit(1);
  return updated[0] as TimerSession;
}

export async function getActiveTimerSession(): Promise<TimerSession | null> {
  const rows = await db
    .select()
    .from(schema.timerSessions)
    .where(
      and(
        isNull(schema.timerSessions.deletedAt),
        eq(schema.timerSessions.status, 'running')
      )
    )
    .limit(1);
  if (rows.length > 0) return rows[0] as TimerSession;

  const paused = await db
    .select()
    .from(schema.timerSessions)
    .where(
      and(
        isNull(schema.timerSessions.deletedAt),
        eq(schema.timerSessions.status, 'paused')
      )
    )
    .limit(1);
  return paused.length > 0 ? (paused[0] as TimerSession) : null;
}

export async function deleteTimerSession(id: string): Promise<void> {
  await db.delete(schema.timerSessions).where(eq(schema.timerSessions.id, id));
}

export async function clearAllData(): Promise<void> {
  await db.delete(schema.todos);
  await db.delete(schema.pluses);
  await db.delete(schema.timerSessions);
  await db.delete(schema.syncConfig);
  await db.delete(schema.hlcState);
}
