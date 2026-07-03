import { eq } from 'drizzle-orm';
import { pluses } from './schema.js';
import { pluseToRow, rowToPluse } from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import type { Pluse } from '@utral/types';
import { getGenerateId, type DbStore } from './store.js';

export async function createPluse(
  store: DbStore,
  name: string,
  intervals: number[],
  repeatCount: number,
  description?: string,
  intervalTodos?: Record<number, string>,
  autoAdvance?: boolean
): Promise<Pluse> {
  const generateId = getGenerateId(store);
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const pluse: Pluse = {
    id: generateId(),
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
  await store.db.insert(pluses).values(pluseToRow(pluse));
  await store.notifyDbOperation('pluses', 'create', pluse.id);
  return pluse;
}

export async function getAllPluses(store: DbStore): Promise<Pluse[]> {
  const rows = (await store.db.select().from(pluses)) as any[];
  return rows.map(rowToPluse);
}

export async function getPluse(store: DbStore, id: string): Promise<Pluse | undefined> {
  const rows = (await store.db.select().from(pluses).where(eq(pluses.id, id))) as any[];
  const row = rows[0];
  return row ? rowToPluse(row) : undefined;
}

export async function getActivePluse(store: DbStore): Promise<Pluse | undefined> {
  const rows = (await store.db.select().from(pluses).where(eq(pluses.isActive, true))) as any[];
  const row = rows[0];
  return row ? rowToPluse(row) : undefined;
}

export async function setActivePluse(
  store: DbStore,
  id: string | null
): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);

  const currentActive = await getActivePluse(store);
  if (currentActive && currentActive.id !== id) {
    const mergedUpdatedAt = mergeHLC(currentActive.updatedAt, hlc);
    await store.db
      .update(pluses)
      .set({
        isActive: false,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(pluses.id, currentActive.id));
    await store.notifyDbOperation('pluses', 'update', currentActive.id);
  }

  if (id) {
    const target = await getPluse(store, id);
    if (target) {
      const mergedUpdatedAt = target.updatedAt ? mergeHLC(target.updatedAt, hlc) : hlc;
      await store.db
        .update(pluses)
        .set({
          isActive: true,
          updatedAtWall: mergedUpdatedAt.wall,
          updatedAtCounter: mergedUpdatedAt.counter,
          updatedAtNode: mergedUpdatedAt.node,
        })
        .where(eq(pluses.id, id));
      await store.notifyDbOperation('pluses', 'update', id);
    }
  }
}

export async function updatePluse(
  store: DbStore,
  id: string,
  updates: Partial<
    Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'intervalTodos' | 'autoAdvance'
  >
>
): Promise<void> {
  const nodeId = store.deviceId;
  const existing = await getPluse(store, id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(pluses)
    .set({
      ...pluseToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<Pluse>),
    })
    .where(eq(pluses.id, id));
  await store.notifyDbOperation('pluses', 'update', id);
}

export async function deletePluse(store: DbStore, id: string): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const existing = await getPluse(store, id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await store.db
    .update(pluses)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(pluses.id, id));
  await store.notifyDbOperation('pluses', 'delete', id);
}

// ─── Timer state machine ───

export async function getActivePluseTimer(store: DbStore): Promise<Pluse | undefined> {
  const rows = (await store.db.select().from(pluses).where(eq(pluses.timerStatus, 'running'))) as any[];
  if (rows.length > 0) return rowToPluse(rows[0]);
  const paused = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.timerStatus, 'paused'))) as any[];
  return paused.length > 0 ? rowToPluse(paused[0]) : undefined;
}

export async function startPluseTimer(store: DbStore, pluseId: string): Promise<Pluse> {
  const nodeId = store.deviceId;
  const rows = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(pluses)
    .set({
      timerStatus: 'running',
      startedAt: new Date(),
      accumulatedSeconds: 0,
      currentIntervalIndex: 0,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(pluses.id, pluseId));
  await store.notifyDbOperation('pluses', 'update', pluseId);
  const updated = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  return rowToPluse(updated[0]);
}

export async function pausePluseTimer(
  store: DbStore,
  pluseId: string,
  accumulatedSeconds: number,
  currentIntervalIndex: number
): Promise<Pluse> {
  const nodeId = store.deviceId;
  const rows = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(pluses)
    .set({
      timerStatus: 'paused',
      startedAt: null,
      accumulatedSeconds,
      currentIntervalIndex,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(pluses.id, pluseId));
  await store.notifyDbOperation('pluses', 'update', pluseId);
  const updated = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  return rowToPluse(updated[0]);
}

export async function resumePluseTimer(store: DbStore, pluseId: string): Promise<Pluse> {
  const nodeId = store.deviceId;
  const rows = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(pluses)
    .set({
      timerStatus: 'running',
      startedAt: new Date(),
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(pluses.id, pluseId));
  await store.notifyDbOperation('pluses', 'update', pluseId);
  const updated = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  return rowToPluse(updated[0]);
}

export async function stopPluseTimer(store: DbStore, pluseId: string): Promise<void> {
  const nodeId = store.deviceId;
  const rows = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(pluses)
    .set({
      timerStatus: 'idle',
      startedAt: null,
      accumulatedSeconds: 0,
      currentIntervalIndex: 0,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(pluses.id, pluseId));
  await store.notifyDbOperation('pluses', 'update', pluseId);
}

export async function advancePluseTimer(
  store: DbStore,
  pluseId: string,
  currentIntervalIndex: number
): Promise<Pluse> {
  const nodeId = store.deviceId;
  const rows = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  const existing = rows[0] ? rowToPluse(rows[0]) : undefined;
  if (!existing) throw new Error('Pluse not found');
  const mergedUpdatedAt = existing.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(pluses)
    .set({
      currentIntervalIndex,
      accumulatedSeconds: 0,
      startedAt: new Date(),
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(pluses.id, pluseId));
  await store.notifyDbOperation('pluses', 'update', pluseId);
  const updated = (await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, pluseId))) as any[];
  return rowToPluse(updated[0]);
}

export function getElapsedSeconds(pluse: Pluse): number {
  if (pluse.timerStatus === 'running' && pluse.startedAt) {
    const now = Date.now();
    const started =
      pluse.startedAt instanceof Date
        ? pluse.startedAt.getTime()
        : new Date(pluse.startedAt).getTime();
    return pluse.accumulatedSeconds + Math.floor((now - started) / 1000);
  }
  return pluse.accumulatedSeconds;
}
