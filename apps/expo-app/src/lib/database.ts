import AsyncStorage from '@react-native-async-storage/async-storage';

const TODOS_KEY = '@utral_todos';
const PLUSES_KEY = '@utral_pluses';
const TIMER_SESSIONS_KEY = '@utral_timer_sessions';
const SYNC_CONFIG_KEY = '@utral_sync_config';
const HLC_STATE_KEY = '@utral_hlc_state';

export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface Todo {
  id: string;
  title: string;
  description: string;
  nodeType: 'goal' | 'task';
  status: TodoStatus;
  priority: 'low' | 'medium' | 'high';
  goalStatus?: 'active' | 'paused' | 'achieved' | 'abandoned';
  estimatedMinutes: number;
  scheduledDate?: string;
  dueDate?: string;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Pluse {
  id: string;
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  autoAdvance: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TimerSession {
  id: string;
  pluseId?: string;
  todoId?: string;
  name: string;
  intervals: number[];
  repeatCount: number;
  currentIndex: number;
  elapsedSeconds: number;
  status: 'running' | 'paused' | 'completed';
  startedAt: string;
  pausedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SyncConfig {
  serverUrl: string;
  apiToken?: string;
}

export interface HLCState {
  counter: number;
  node: string;
  lastSeen: number;
}

async function getStore<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setStore<T>(key: string, data: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

export async function getAll<T>(key: string): Promise<T[]> {
  return getStore<T>(key);
}

export async function getById<T extends { id: string }>(key: string, id: string): Promise<T | null> {
  const items = await getStore<T>(key);
  return items.find((item) => item.id === id) || null;
}

export async function upsert<T extends { id: string }>(key: string, item: T): Promise<T> {
  const items = await getStore<T>(key);
  const index = items.findIndex((i) => i.id === item.id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
  await setStore(key, items);
  return item;
}

export async function remove<T extends { id: string }>(key: string, id: string): Promise<void> {
  const items = await getStore<T>(key);
  await setStore(
    key,
    items.filter((i) => i.id !== id)
  );
}

export async function getSyncConfigData(): Promise<SyncConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setSyncConfigData(config: SyncConfig): Promise<void> {
  await AsyncStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

export async function getHLCState(): Promise<HLCState> {
  try {
    const raw = await AsyncStorage.getItem(HLC_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { counter: 0, node: Math.random().toString(36).slice(2, 10), lastSeen: Date.now() };
}

export async function setHLCState(state: HLCState): Promise<void> {
  await AsyncStorage.setItem(HLC_STATE_KEY, JSON.stringify(state));
}

export async function createTimerSession(data: Partial<TimerSession>): Promise<TimerSession> {
  const session: TimerSession = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: data.name || '',
    intervals: data.intervals || [],
    repeatCount: data.repeatCount || 1,
    currentIndex: data.currentIndex || 0,
    elapsedSeconds: data.elapsedSeconds || 0,
    status: data.status || 'running',
    startedAt: data.startedAt || new Date().toISOString(),
    pluseId: data.pluseId,
    todoId: data.todoId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return upsert(TIMER_SESSIONS_KEY, session);
}

export async function updateTimerSession(
  id: string,
  updates: Partial<TimerSession>
): Promise<TimerSession | null> {
  const existing = await getById<TimerSession>(TIMER_SESSIONS_KEY, id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  return upsert(TIMER_SESSIONS_KEY, updated);
}

export async function getActiveTimerSession(): Promise<TimerSession | null> {
  const sessions = await getAll<TimerSession>(TIMER_SESSIONS_KEY);
  return sessions.find((s) => s.status === 'running' || s.status === 'paused') || null;
}

export async function deleteTimerSession(id: string): Promise<void> {
  return remove(TIMER_SESSIONS_KEY, id);
}

export { TODOS_KEY, PLUSES_KEY, TIMER_SESSIONS_KEY };
