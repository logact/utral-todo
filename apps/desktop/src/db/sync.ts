import { fetch } from '@tauri-apps/plugin-http';
import { db } from './drizzle-adapter';
import { todos, todoRelations, todoLogs, actionEdges, plans, pluses, syncConfig } from './schema';
import { eq } from 'drizzle-orm';
import { parseTodo, parseRelation, parseLog, parseActionEdge, parsePluse, parsePlan } from './client';
import { todoToRow, relationToRow, todoLogToRow, actionEdgeToRow, planToRow, pluseToRow } from './schema';
import type { Todo, TodoRelation, TodoLog, ActionEdge, Pluse, Plan } from '../types';

export interface SyncConfig {
  serverUrl: string;
  apiToken?: string;
  remoteOpsEnabled?: boolean;
  userId?: string;
  channel?: string;
}

export interface SyncPayload {
  todos: Todo[];
  relations: TodoRelation[];
  todoLogs: TodoLog[];
  actionEdges: ActionEdge[];
  plans: Plan[];
  pluses: Pluse[];
}

export interface SyncResult {
  success: boolean;
  pulled: {
    todos: number;
    relations: number;
    todoLogs: number;
    actionEdges: number;
    plans: number;
    pluses: number;
  };
  pushed: {
    todos: number;
    relations: number;
    todoLogs: number;
    actionEdges: number;
    plans: number;
    pluses: number;
  };
  error?: string;
}

// Keys used inside the `sync_config` key/value table.
const CONFIG_KEYS = {
  serverUrl: 'serverUrl',
  apiToken: 'apiToken',
  remoteOpsEnabled: 'remoteOpsEnabled',
  lastSyncAt: 'lastSyncAt',
} as const;

async function getConfigValue(key: string): Promise<string | undefined> {
  const rows = await db.select().from(syncConfig).where(eq(syncConfig.key, key)).limit(1);
  const value = rows[0]?.value;
  return value === '' ? undefined : value;
}

async function setConfigValue(key: string, value: string): Promise<void> {
  await db.insert(syncConfig).values({ key, value })
    .onConflictDoUpdate({ target: syncConfig.key, set: { value } });
}

/**
 * One-time migration: move sync config from localStorage into the SQLite
 * `sync_config` table. This runs during app initialization and removes the
 * legacy keys so it only executes once.
 */
export async function migrateLegacySyncConfig(): Promise<void> {
  try {
    const serverUrl = localStorage.getItem('syncServerUrl');
    if (serverUrl) {
      await setConfigValue(CONFIG_KEYS.serverUrl, normalizeServerUrl(serverUrl));
      localStorage.removeItem('syncServerUrl');
    }

    const apiToken = localStorage.getItem('syncApiToken');
    if (apiToken) {
      await setConfigValue(CONFIG_KEYS.apiToken, apiToken);
      localStorage.removeItem('syncApiToken');
    }

    const remoteOpsEnabled = localStorage.getItem('syncRemoteOpsEnabled');
    if (remoteOpsEnabled) {
      await setConfigValue(CONFIG_KEYS.remoteOpsEnabled, remoteOpsEnabled);
      localStorage.removeItem('syncRemoteOpsEnabled');
    }

    const lastSyncAt = localStorage.getItem('lastSyncAt');
    if (lastSyncAt) {
      await setConfigValue(CONFIG_KEYS.lastSyncAt, lastSyncAt);
      localStorage.removeItem('lastSyncAt');
    }
  } catch (err) {
    console.error('[sync] failed to migrate legacy sync config:', err);
  }
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
    throw new Error(`Network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`, { cause: fetchErr });
  }

  if (!res.ok) {
    const text = await res.text();
    console.error('[sync] HTTP error:', res.status, text.slice(0, 200));
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function exportLocalData(): Promise<SyncPayload> {
  const allTodos = (await db.select().from(todos)) as any[];
  const allRelations = (await db.select().from(todoRelations)) as any[];
  const allLogs = (await db.select().from(todoLogs)) as any[];
  const allEdges = (await db.select().from(actionEdges)) as any[];
  const allPlans = (await db.select().from(plans)) as any[];
  const allPluses = (await db.select().from(pluses)) as any[];
  return {
    todos: allTodos,
    relations: allRelations,
    todoLogs: allLogs,
    actionEdges: allEdges,
    plans: allPlans,
    pluses: allPluses,
  } as unknown as SyncPayload;
}

function normalizeDates<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items));
}

export async function syncAll(config: SyncConfig): Promise<SyncResult> {
  console.log('[sync] starting legacy full sync to:', config.serverUrl);
  const result: SyncResult = {
    success: false,
    pulled: { todos: 0, relations: 0, todoLogs: 0, actionEdges: 0, plans: 0, pluses: 0 },
    pushed: { todos: 0, relations: 0, todoLogs: 0, actionEdges: 0, plans: 0, pluses: 0 },
  };

  try {
    // 1. Push all local data to server
    console.log('[sync] exporting local data...');
    const localData = await exportLocalData();
    const pushRes = await syncFetch('/api/sync', config, {
      method: 'POST',
      body: JSON.stringify({
        ...localData,
        todos: normalizeDates(localData.todos),
        relations: normalizeDates(localData.relations),
        todoLogs: normalizeDates(localData.todoLogs),
        actionEdges: normalizeDates(localData.actionEdges),
        plans: normalizeDates(localData.plans),
        pluses: normalizeDates(localData.pluses),
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

    // 3. Merge remote data into local using Drizzle transactions
    await db.transaction(async (tx) => {
      if (remoteData.todos?.length) {
        for (const item of remoteData.todos) {
          const todo = parseTodo(item);
          const row = todoToRow(todo);
          const existing = await tx.select().from(todos).where(eq(todos.id, todo.id));
          if (existing.length > 0) {
            await tx.update(todos).set(row).where(eq(todos.id, todo.id));
          } else {
            await tx.insert(todos).values(row);
          }
        }
        result.pulled.todos = remoteData.todos.length;
      }

      if (remoteData.relations?.length) {
        for (const item of remoteData.relations) {
          const relation = parseRelation(item);
          const row = relationToRow(relation);
          const existing = await tx.select().from(todoRelations).where(eq(todoRelations.id, relation.id));
          if (existing.length > 0) {
            await tx.update(todoRelations).set(row).where(eq(todoRelations.id, relation.id));
          } else {
            await tx.insert(todoRelations).values(row);
          }
        }
        result.pulled.relations = remoteData.relations.length;
      }

      if (remoteData.todoLogs?.length) {
        for (const item of remoteData.todoLogs) {
          const log = parseLog(item);
          const row = todoLogToRow(log);
          const existing = await tx.select().from(todoLogs).where(eq(todoLogs.id, log.id));
          if (existing.length > 0) {
            await tx.update(todoLogs).set(row).where(eq(todoLogs.id, log.id));
          } else {
            await tx.insert(todoLogs).values(row);
          }
        }
        result.pulled.todoLogs = remoteData.todoLogs.length;
      }

      if (remoteData.actionEdges?.length) {
        for (const item of remoteData.actionEdges) {
          const edge = parseActionEdge(item);
          const row = actionEdgeToRow(edge);
          const existing = await tx.select().from(actionEdges).where(eq(actionEdges.id, edge.id));
          if (existing.length > 0) {
            await tx.update(actionEdges).set(row).where(eq(actionEdges.id, edge.id));
          } else {
            await tx.insert(actionEdges).values(row);
          }
        }
        result.pulled.actionEdges = remoteData.actionEdges.length;
      }

      if (remoteData.plans?.length) {
        for (const item of remoteData.plans) {
          const plan = parsePlan(item);
          const row = planToRow(plan);
          const existing = await tx.select().from(plans).where(eq(plans.id, plan.id));
          if (existing.length > 0) {
            await tx.update(plans).set(row).where(eq(plans.id, plan.id));
          } else {
            await tx.insert(plans).values(row);
          }
        }
        result.pulled.plans = remoteData.plans.length;
      }

      if (remoteData.pluses?.length) {
        for (const item of remoteData.pluses) {
          const pluse = parsePluse(item);
          const row = pluseToRow(pluse);
          const existing = await tx.select().from(pluses).where(eq(pluses.id, pluse.id));
          if (existing.length > 0) {
            await tx.update(pluses).set(row).where(eq(pluses.id, pluse.id));
          } else {
            await tx.insert(pluses).values(row);
          }
        }
        result.pulled.pluses = remoteData.pluses.length;
      }
    });

    // Save last sync timestamp
    await setConfigValue(CONFIG_KEYS.lastSyncAt, new Date().toISOString());
    result.success = true;
    return result;
  } catch (err) {
    console.error('[sync] legacy full sync error:', err);
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

export async function getLastSyncAt(): Promise<Date | undefined> {
  const raw = await getConfigValue(CONFIG_KEYS.lastSyncAt);
  if (!raw) return undefined;
  return new Date(raw);
}

export async function getSyncConfig(): Promise<SyncConfig | undefined> {
  const serverUrl = await getConfigValue(CONFIG_KEYS.serverUrl);
  const apiToken = await getConfigValue(CONFIG_KEYS.apiToken);
  const remoteOpsEnabledRaw = await getConfigValue(CONFIG_KEYS.remoteOpsEnabled);
  return {
    serverUrl,
    apiToken,
    remoteOpsEnabled: remoteOpsEnabledRaw === 'true',
  };
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await setConfigValue(CONFIG_KEYS.serverUrl, normalizeServerUrl(config.serverUrl));
  await setConfigValue(CONFIG_KEYS.apiToken, config.apiToken || '');
  await setConfigValue(CONFIG_KEYS.remoteOpsEnabled, config.remoteOpsEnabled ? 'true' : 'false');
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
