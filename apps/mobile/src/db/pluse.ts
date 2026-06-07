import { db } from './database';
import type { Pluse } from '@utral/types';
import { triggerSync } from './timerSessions';

export async function getAllPluses(): Promise<Pluse[]> {
  return db.pluses.toArray();
}

export async function getPluse(id: string): Promise<Pluse | undefined> {
  return db.pluses.get(id);
}

export async function createPluse(
  name: string,
  intervals: number[],
  repeatCount: number,
  description?: string,
  autoAdvance?: boolean
): Promise<Pluse> {
  const now = new Date();
  const pluse: Pluse = {
    id: crypto.randomUUID(),
    name,
    description: description ?? '',
    intervals,
    repeatCount,
    autoAdvance: autoAdvance ?? true,
    createdAt: now,
    updatedAt: now,
  };
  await db.pluses.add(pluse);
  await triggerSync('pluses', 'create', pluse.id);
  return pluse;
}

export async function updatePluse(
  id: string,
  updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'autoAdvance'>>
): Promise<void> {
  await db.pluses.update(id, { ...updates, updatedAt: new Date() });
  await triggerSync('pluses', 'update', id);
}

export async function deletePluse(id: string): Promise<void> {
  await db.pluses.delete(id);
  await triggerSync('pluses', 'delete', id);
}
