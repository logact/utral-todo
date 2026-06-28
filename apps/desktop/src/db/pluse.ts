import { db } from './drizzle-adapter';
import { pluses } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Pluse } from '../types';
import { pluseToRow, rowToPluse } from './schema';

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
  await db.insert(pluses).values(pluseToRow(pluse) as any);
  onLocalChange('pluses', 'create', pluse.id).catch(() => {});
  return pluse;
}

export async function getAllPluses(): Promise<Pluse[]> {
  const rows = await db.select().from(pluses) as any[];
  return rows.map(rowToPluse);
}

export async function getPluse(id: string): Promise<Pluse | undefined> {
  const rows = await db.select().from(pluses).where(eq(pluses.id, id)) as any[];
  const row = rows[0];
  return row ? rowToPluse(row) : undefined;
}

export async function updatePluse(
  id: string,
  updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'intervalTodos' | 'autoAdvance'>>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await getPluse(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(pluses).set({
    ...pluseToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<Pluse>),
  } as any).where(eq(pluses.id, id));
  onLocalChange('pluses', 'update', id).catch(() => {});
}

export async function deletePluse(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await getPluse(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.update(pluses).set({
    deleted_at_wall: hlc.wall,
    deleted_at_counter: hlc.counter,
    deleted_at_node: hlc.node,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(pluses.id, id));
  onLocalChange('pluses', 'delete', id).catch(() => {});
}
