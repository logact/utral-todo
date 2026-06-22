import { getAllTodos } from './todos';
import { getAllPluses } from './pluse';
import { getSyncConfigData, setSyncConfigData, type SyncConfig } from './database';

export async function getSyncConfig(): Promise<SyncConfig | null> {
  return getSyncConfigData();
}

export async function setSyncConfig(config: SyncConfig): Promise<void> {
  return setSyncConfigData(config);
}

async function syncFetch(path: string, options: RequestInit = {}): Promise<any> {
  const config = await getSyncConfig();
  if (!config?.serverUrl) throw new Error('Sync server not configured');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (config.apiToken) {
    headers['Authorization'] = `Bearer ${config.apiToken}`;
  }

  const response = await fetch(`${config.serverUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }

  return response.json();
}

export async function syncAll(): Promise<void> {
  const config = await getSyncConfig();
  if (!config?.serverUrl) throw new Error('Sync server not configured');

  const todos = await getAllTodos();
  const pluses = await getAllPluses();

  await syncFetch('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ todos, pluses }),
  });
}
