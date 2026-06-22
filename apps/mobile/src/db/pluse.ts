import { db } from './database';
import { getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '@utral/types';
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
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const pluse: Pluse = {
    id: crypto.randomUUID(),
    name,
    description: description ?? '',
    intervals,
    repeatCount,
    autoAdvance: autoAdvance ?? true,
    createdAt: hlc,
    updatedAt: hlc,
  };
  await db.pluses.add(pluse);
  await triggerSync('pluses', 'create', pluse.id);
  return pluse;
}

export async function updatePluse(
  id: string,
  updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'autoAdvance'>>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await db.pluses.get(id);
  const hlc = existing
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.pluses.update(id, { ...updates, updatedAt: hlc });
  await triggerSync('pluses', 'update', id);
}

export async function deletePluse(id: string): Promise<void> {
  await db.pluses.delete(id);
  await triggerSync('pluses', 'delete', id);
}
