import { db } from './drizzle-adapter';
import { pluses } from './schema';
import { eq } from 'drizzle-orm';
import { notifyDbOperation, getOrCreateDeviceId } from '../lib/sync/syncEngine';
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
    timerStatus: 'idle',
    currentIntervalIndex: 0,
    accumulatedSeconds: 0,
    isActive: false,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };
  await db.insert(pluses).values(pluseToRow(pluse));
  notifyDbOperation('pluses', 'create', pluse.id).catch(() => {});
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

export async function getActivePluse(): Promise<Pluse | undefined> {
  const rows = await db.select().from(pluses).where(eq(pluses.isActive, true)) as any[];
  const row = rows[0];
  return row ? rowToPluse(row) : undefined;
}

export async function setActivePluse(id: string | null): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);

  const currentActive = await getActivePluse();
  if (currentActive && currentActive.id !== id) {
    const mergedUpdatedAt = mergeHLC(currentActive.updatedAt, hlc);
    await db.update(pluses).set({
      isActive: false,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    }).where(eq(pluses.id, currentActive.id));
    notifyDbOperation('pluses', 'update', currentActive.id).catch(() => {});
  }

  if (id) {
    const target = await getPluse(id);
    if (target) {
      const mergedUpdatedAt = target.updatedAt ? mergeHLC(target.updatedAt, hlc) : hlc;
      await db.update(pluses).set({
        isActive: true,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      }).where(eq(pluses.id, id));
      notifyDbOperation('pluses', 'update', id).catch(() => {});
    }
  }
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
  }).where(eq(pluses.id, id));
  notifyDbOperation('pluses', 'update', id).catch(() => {});
}

export async function deletePluse(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await getPluse(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.update(pluses).set({
    isDeleted: true,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(pluses.id, id));
  notifyDbOperation('pluses', 'delete', id).catch(() => {});
}
