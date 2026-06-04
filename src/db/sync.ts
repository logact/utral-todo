import { fetch } from '@tauri-apps/plugin-http';
import { db } from './database';
import { parseTodo, parseRelation, parseLog, parseProject, parseRoadmap, parseActionEdge, parsePluse, parseTimerSession } from './client';
import type { Todo, Project, TodoRelation, TodoLog, Roadmap, ActionEdge, Pluse, TimerSession } from '../types';

export interface SyncConfig {
  serverUrl: string;
  apiToken?: string;
}

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

function normalizeServerUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

async function syncFetch(path: string, config: SyncConfig, options?: RequestInit): Promise<Response> {
  const url = normalizeServerUrl(config.serverUrl);
  const fullUrl = `${url}${path}`;
  console.log('[sync] fetching:', fullUrl);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      headers,
      ...options,
    });
  } catch (fetchErr) {
    console.error('[sync] fetch failed:', fetchErr);
    throw new Error(`Network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error('[sync] HTTP error:', res.status, text.slice(0, 200));
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

export async function syncAll(config: SyncConfig): Promise<SyncResult> {
  console.log('[sync] starting sync to:', config.serverUrl);
  const result: SyncResult = {
    success: false,
    pulled: { todos: 0, projects: 0, relations: 0, todoLogs: 0, roadmaps: 0, actionEdges: 0, pluses: 0, timerSessions: 0 },
    pushed: { todos: 0, projects: 0, relations: 0, todoLogs: 0, roadmaps: 0, actionEdges: 0, pluses: 0, timerSessions: 0 },
  };

  try {
    // 1. Push all local data to server
    console.log('[sync] exporting local data...');
    const localData = await exportLocalData();
    console.log('[sync] local data:', {
      todos: localData.todos.length,
      projects: localData.projects.length,
      relations: localData.relations.length,
    });
    const pushRes = await syncFetch('/api/sync', config, {
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
    const pullRes = await syncFetch('/api/sync', config, { method: 'GET' });
    const remoteData = await pullRes.json() as SyncPayload;

    // 3. Merge remote data into local
    await db.transaction('rw', [
      db.todos, db.projects, db.relations, db.todoLogs,
      db.roadmaps, db.actionEdges, db.pluses, db.timerSessions,
    ], async () => {
      // Merge strategy: remote overwrites local for same IDs
      // For todos: keep local-only items, overwrite with remote for matching IDs
      if (remoteData.todos?.length) {
        for (const item of remoteData.todos) {
          const todo = parseTodo(item);
          const existing = await db.todos.get(todo.id);
          if (existing) {
            await db.todos.update(todo.id, { ...todo });
          } else {
            await db.todos.add(todo);
          }
        }
        result.pulled.todos = remoteData.todos.length;
      }

      if (remoteData.projects?.length) {
        for (const item of remoteData.projects) {
          const project = parseProject(item);
          const existing = await db.projects.get(project.id);
          if (existing) {
            await db.projects.update(project.id, { ...project });
          } else {
            await db.projects.add(project);
          }
        }
        result.pulled.projects = remoteData.projects.length;
      }

      if (remoteData.relations?.length) {
        for (const item of remoteData.relations) {
          const relation = parseRelation(item);
          const existing = await db.relations.get(relation.id);
          if (existing) {
            await db.relations.update(relation.id, { ...relation });
          } else {
            await db.relations.add(relation);
          }
        }
        result.pulled.relations = remoteData.relations.length;
      }

      if (remoteData.todoLogs?.length) {
        for (const item of remoteData.todoLogs) {
          const log = parseLog(item);
          const existing = await db.todoLogs.get(log.id);
          if (existing) {
            await db.todoLogs.update(log.id, { ...log });
          } else {
            await db.todoLogs.add(log);
          }
        }
        result.pulled.todoLogs = remoteData.todoLogs.length;
      }

      if (remoteData.roadmaps?.length) {
        for (const item of remoteData.roadmaps) {
          const roadmap = parseRoadmap(item);
          const existing = await db.roadmaps.get(roadmap.id);
          if (existing) {
            await db.roadmaps.update(roadmap.id, { ...roadmap });
          } else {
            await db.roadmaps.add(roadmap);
          }
        }
        result.pulled.roadmaps = remoteData.roadmaps.length;
      }

      if (remoteData.actionEdges?.length) {
        for (const item of remoteData.actionEdges) {
          const edge = parseActionEdge(item);
          const existing = await db.actionEdges.get(edge.id);
          if (existing) {
            await db.actionEdges.update(edge.id, { ...edge });
          } else {
            await db.actionEdges.add(edge);
          }
        }
        result.pulled.actionEdges = remoteData.actionEdges.length;
      }

      if (remoteData.pluses?.length) {
        for (const item of remoteData.pluses) {
          const pluse = parsePluse(item);
          const existing = await db.pluses.get(pluse.id);
          if (existing) {
            await db.pluses.update(pluse.id, { ...pluse });
          } else {
            await db.pluses.add(pluse);
          }
        }
        result.pulled.pluses = remoteData.pluses.length;
      }

      if (remoteData.timerSessions?.length) {
        for (const item of remoteData.timerSessions) {
          const session = parseTimerSession(item);
          const existing = await db.timerSessions.get(session.id);
          if (existing) {
            await db.timerSessions.update(session.id, { ...session });
          } else {
            await db.timerSessions.add(session);
          }
        }
        result.pulled.timerSessions = remoteData.timerSessions.length;
      }
    });

    // Save last sync timestamp
    localStorage.setItem('lastSyncAt', new Date().toISOString());
    result.success = true;
    return result;
  } catch (err) {
    console.error('[sync] error:', err);
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

export function getLastSyncAt(): Date | undefined {
  const raw = localStorage.getItem('lastSyncAt');
  if (!raw) return undefined;
  return new Date(raw);
}

export function getSyncConfig(): SyncConfig | undefined {
  const serverUrl = localStorage.getItem('syncServerUrl');
  if (!serverUrl) return undefined;
  return {
    serverUrl,
    apiToken: localStorage.getItem('syncApiToken') || undefined,
  };
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem('syncServerUrl', normalizeServerUrl(config.serverUrl));
  if (config.apiToken) {
    localStorage.setItem('syncApiToken', config.apiToken);
  } else {
    localStorage.removeItem('syncApiToken');
  }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'Server URL is required' };
  }
  try {
    const normalized = normalizeServerUrl(trimmed);
    new URL(normalized);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format. Try: http://localhost:3001' };
  }
}
