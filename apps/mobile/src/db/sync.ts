import { db } from './database';
import type { Todo, Project, TodoRelation, TodoLog, Roadmap, ActionEdge, Pluse, TimerSession, SyncConfig } from '@utral/types';

export interface SyncPayload {
  todos: Todo[];
  projects: Project[];
  relations: TodoRelation[];
  todoLogs: TodoLog[];
  roadmaps: Roadmap[];
  actionEdges: ActionEdge[];
  pluses: Pluse[];
  timerSessions: TimerSession[];
}

export interface SyncResult {
  success: boolean;
  pulled: {
    todos: number;
    projects: number;
    relations: number;
    todoLogs: number;
    roadmaps: number;
    actionEdges: number;
    pluses: number;
    timerSessions: number;
  };
  pushed: {
    todos: number;
    projects: number;
    relations: number;
    todoLogs: number;
    roadmaps: number;
    actionEdges: number;
    pluses: number;
    timerSessions: number;
  };
  error?: string;
}

const SYNC_CONFIG_KEY = 'utral:syncConfig';

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SyncConfig;
  } catch {
    return null;
  }
}

export function setSyncConfig(config: SyncConfig | null): void {
  if (config) {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(SYNC_CONFIG_KEY);
  }
}

function normalizeServerUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export async function syncFetch(path: string, options?: RequestInit): Promise<Response> {
  const config = getSyncConfig();
  if (!config) throw new Error('Sync not configured');

  const url = normalizeServerUrl(config.serverUrl);
  const fullUrl = `${url}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  const res = await fetch(fullUrl, {
    headers,
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function exportLocalData(): Promise<SyncPayload> {
  return {
    todos: await db.todos.toArray(),
    projects: await db.projects.toArray(),
    relations: await db.relations.toArray(),
    todoLogs: await db.todoLogs.toArray(),
    roadmaps: await db.roadmaps.toArray(),
    actionEdges: await db.actionEdges.toArray(),
    pluses: await db.pluses.toArray(),
    timerSessions: await db.timerSessions.toArray(),
  };
}

function normalizeDates<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items));
}

export async function syncAll(): Promise<SyncResult> {
  const config = getSyncConfig();
  if (!config) {
    return {
      success: false,
      pulled: { todos: 0, projects: 0, relations: 0, todoLogs: 0, roadmaps: 0, actionEdges: 0, pluses: 0, timerSessions: 0 },
      pushed: { todos: 0, projects: 0, relations: 0, todoLogs: 0, roadmaps: 0, actionEdges: 0, pluses: 0, timerSessions: 0 },
      error: 'Sync not configured',
    };
  }

  const result: SyncResult = {
    success: false,
    pulled: { todos: 0, projects: 0, relations: 0, todoLogs: 0, roadmaps: 0, actionEdges: 0, pluses: 0, timerSessions: 0 },
    pushed: { todos: 0, projects: 0, relations: 0, todoLogs: 0, roadmaps: 0, actionEdges: 0, pluses: 0, timerSessions: 0 },
  };

  try {
    const localData = await exportLocalData();

    // 1. Push all local data to server
    const pushRes = await syncFetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        ...localData,
        todos: normalizeDates(localData.todos),
        projects: normalizeDates(localData.projects),
        relations: normalizeDates(localData.relations),
        todoLogs: normalizeDates(localData.todoLogs),
        roadmaps: normalizeDates(localData.roadmaps),
        actionEdges: normalizeDates(localData.actionEdges),
        pluses: normalizeDates(localData.pluses),
        timerSessions: normalizeDates(localData.timerSessions),
      }),
    });
    const pushResult = await pushRes.json() as { accepted: Partial<Record<keyof SyncPayload, number>> };
    if (pushResult.accepted) {
      for (const key of Object.keys(pushResult.accepted) as (keyof SyncPayload)[]) {
        result.pushed[key] = pushResult.accepted[key] ?? 0;
      }
    }

    // 2. Pull all data from server
    const pullRes = await syncFetch('/api/sync', { method: 'GET' });
    const remoteData = await pullRes.json() as SyncPayload;

    // 3. Merge remote data into local
    await db.transaction('rw', [
      db.todos, db.projects, db.relations, db.todoLogs,
      db.roadmaps, db.actionEdges, db.pluses, db.timerSessions,
    ], async () => {
      for (const key of Object.keys(remoteData) as (keyof SyncPayload)[]) {
        const items = remoteData[key];
        if (!items?.length) continue;

        const table = {
          todos: db.todos,
          projects: db.projects,
          relations: db.relations,
          todoLogs: db.todoLogs,
          roadmaps: db.roadmaps,
          actionEdges: db.actionEdges,
          pluses: db.pluses,
          timerSessions: db.timerSessions,
        }[key];

        if (!table) continue;

        for (const item of items) {
          const record = item as unknown as Record<string, unknown>;
          const existing = await table.get(record.id as string);
          if (existing) {
            await table.update(record.id as string, { ...item } as never);
          } else {
            await table.add(item as never);
          }
        }
        result.pulled[key] = items.length;
      }
    });

    result.success = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}
