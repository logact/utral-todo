import { fetch } from '@tauri-apps/plugin-http';
import type { Todo } from '../types';

function normalizeServerUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getSyncConfig() {
  const serverUrl = localStorage.getItem('syncServerUrl');
  if (!serverUrl) return undefined;
  return {
    serverUrl,
    apiToken: localStorage.getItem('syncApiToken') || undefined,
    remoteOpsEnabled: localStorage.getItem('syncRemoteOpsEnabled') === 'true',
  };
}

function isRemoteEnabled(): boolean {
  const config = getSyncConfig();
  return !!config && config.remoteOpsEnabled;
}

async function remoteFetch(path: string, options?: RequestInit): Promise<Response | undefined> {
  const config = getSyncConfig();
  if (!config) return undefined;

  const url = normalizeServerUrl(config.serverUrl);
  const fullUrl = `${url}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  try {
    const res = await fetch(fullUrl, {
      headers,
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[remote] HTTP error:', res.status, text.slice(0, 200));
      return undefined;
    }
    return res;
  } catch (err) {
    console.error('[remote] fetch failed:', err);
    return undefined;
  }
}

function serializeTodo(todo: Todo): Record<string, unknown> {
  return {
    ...todo,
    createdAt: todo.createdAt.toISOString(),
    dueDate: todo.dueDate?.toISOString(),
    scheduledDate: todo.scheduledDate?.toISOString(),
    startedAt: todo.startedAt?.toISOString(),
    completedAt: todo.completedAt?.toISOString(),
    repeatRule: todo.repeatRule
      ? {
          ...todo.repeatRule,
          endDate: todo.repeatRule.endDate?.toISOString(),
        }
      : undefined,
  };
}

function serializeUpdates(updates: Partial<Todo>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...updates };
  if (updates.createdAt) result.createdAt = updates.createdAt.toISOString();
  if (updates.dueDate) result.dueDate = updates.dueDate.toISOString();
  if (updates.scheduledDate) result.scheduledDate = updates.scheduledDate.toISOString();
  if (updates.startedAt) result.startedAt = updates.startedAt.toISOString();
  if (updates.completedAt) result.completedAt = updates.completedAt.toISOString();
  if (updates.repeatRule) {
    result.repeatRule = updates.repeatRule
      ? {
          ...updates.repeatRule,
          endDate: updates.repeatRule.endDate?.toISOString(),
        }
      : undefined;
  }
  return result;
}

export async function createRemoteTodo(todo: Todo): Promise<void> {
  if (!isRemoteEnabled()) return;
  await remoteFetch('/api/todos', {
    method: 'POST',
    body: JSON.stringify(serializeTodo(todo)),
  });
}

export async function updateRemoteTodo(id: string, updates: Partial<Todo>): Promise<void> {
  if (!isRemoteEnabled()) return;
  await remoteFetch(`/api/todos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(serializeUpdates(updates)),
  });
}

export async function deleteRemoteTodo(id: string): Promise<void> {
  if (!isRemoteEnabled()) return;
  await remoteFetch(`/api/todos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getRemoteTodos(): Promise<Todo[] | undefined> {
  if (!isRemoteEnabled()) return undefined;
  const res = await remoteFetch('/api/todos', { method: 'GET' });
  if (!res) return undefined;
  return (await res.json()) as Todo[];
}
