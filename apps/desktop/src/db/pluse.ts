import { db } from './database';
import { onLocalChange } from './syncEngine';
import type { Pluse } from '../types';

export async function createPluse(
  name: string,
  intervals: number[],
  repeatCount: number,
  description?: string
): Promise<Pluse> {
  const now = new Date();
  const pluse: Pluse = {
    id: crypto.randomUUID(),
    name,
    description: description ?? '',
    intervals,
    repeatCount,
    createdAt: now,
    updatedAt: now,
  };
  await db.pluses.add(pluse);
  onLocalChange('pluses', 'create', pluse.id).catch(() => {});
  return pluse;
}

export async function getAllPluses(): Promise<Pluse[]> {
  return db.pluses.toArray();
}

export async function getPluse(id: string): Promise<Pluse | undefined> {
  return db.pluses.get(id);
}

export async function updatePluse(
  id: string,
  updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount'>>
): Promise<void> {
  await db.pluses.update(id, { ...updates, updatedAt: new Date() });
  onLocalChange('pluses', 'update', id).catch(() => {});
}

export async function deletePluse(id: string): Promise<void> {
  await db.pluses.delete(id);
  onLocalChange('pluses', 'delete', id).catch(() => {});
}
