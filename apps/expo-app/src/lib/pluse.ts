import { getAll, getById, upsert, remove, PLUSES_KEY, type Pluse } from './database';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now(): string {
  return new Date().toISOString();
}

export async function getAllPluses(): Promise<Pluse[]> {
  const pluses = await getAll<Pluse>(PLUSES_KEY);
  return pluses.filter((p) => !p.deletedAt);
}

export async function getPluse(id: string): Promise<Pluse | null> {
  return getById<Pluse>(PLUSES_KEY, id);
}

export async function createPluse(data: Partial<Pluse>): Promise<Pluse> {
  const pluse: Pluse = {
    id: generateId(),
    name: data.name || 'Untitled Pluse',
    description: data.description || '',
    intervals: data.intervals || [1500],
    repeatCount: data.repeatCount || 1,
    autoAdvance: data.autoAdvance ?? true,
    createdAt: now(),
    updatedAt: now(),
  };
  return upsert(PLUSES_KEY, pluse);
}

export async function updatePluse(id: string, updates: Partial<Pluse>): Promise<Pluse | null> {
  const existing = await getById<Pluse>(PLUSES_KEY, id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: now() };
  return upsert(PLUSES_KEY, updated);
}

export async function deletePluse(id: string): Promise<void> {
  const existing = await getById<Pluse>(PLUSES_KEY, id);
  if (existing) {
    await upsert(PLUSES_KEY, { ...existing, deletedAt: now(), updatedAt: now() });
  }
}
