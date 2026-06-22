import { db } from './database';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Pluse } from '../types';

export async function createPluse(
  name: string,
  intervals: number[],
  repeatCount: number,
  description?: string,
  intervalTodos?: Record<number, string>,
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
    intervalTodos,
    autoAdvance: autoAdvance ?? true,
    createdAt: hlc,
    updatedAt: hlc,
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
  updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'intervalTodos' | 'autoAdvance'>>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await db.pluses.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.pluses.update(id, { ...updates, updatedAt: mergedUpdatedAt });
  onLocalChange('pluses', 'update', id).catch(() => {});
}

export async function deletePluse(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await db.pluses.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.pluses.update(id, { deletedAt: hlc, updatedAt: mergedUpdatedAt });
  onLocalChange('pluses', 'delete', id).catch(() => {});
}
