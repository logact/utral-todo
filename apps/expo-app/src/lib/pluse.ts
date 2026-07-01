import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Pluse } from '@utral/types';
import { scheduleSyncPush, addPendingChange } from './auto-sync';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getAllPluses(): Promise<Pluse[]> {
  const rows = await db
    .select()
    .from(schema.pluses)
    .where(eq(schema.pluses.isDeleted, false));
  return rows as unknown as Pluse[];
}

export async function getPluse(id: string): Promise<Pluse | null> {
  const rows = await db.select().from(schema.pluses).where(eq(schema.pluses.id, id)).limit(1);
  return rows.length > 0 ? (rows[0] as unknown as Pluse) : null;
}

export async function createPluse(data: Partial<Pluse>): Promise<Pluse> {
  const id = generateId();
  const now = Date.now();
  const pluse = {
    id,
    name: data.name || 'Untitled Pluse',
    description: data.description || '',
    intervals: data.intervals || [1500],
    repeatCount: data.repeatCount || 1,
    autoAdvance: data.autoAdvance ?? true,
    createdAtWall: now,
    createdAtCounter: 0,
    createdAtNode: '',
    updatedAtWall: now,
    updatedAtCounter: 0,
    updatedAtNode: '',
  };
  await db.insert(schema.pluses).values(pluse);
  addPendingChange('pluse', 'create', id);
  scheduleSyncPush();
  return pluse as unknown as Pluse;
}

export async function updatePluse(id: string, updates: Partial<Pluse>): Promise<Pluse | null> {
  const existing = await getPluse(id);
  if (!existing) return null;
  const { id: _, createdAt: _c, updatedAt: _u, ...updateFields } = updates as any;
  const now = Date.now();
  await db
    .update(schema.pluses)
    .set({ ...updateFields, updatedAtWall: now })
    .where(eq(schema.pluses.id, id));
  addPendingChange('pluse', 'update', id);
  scheduleSyncPush();
  return getPluse(id);
}

export async function deletePluse(id: string): Promise<void> {
  const existing = await getPluse(id);
  if (existing) {
    const now = Date.now();
    await db
      .update(schema.pluses)
      .set({ isDeleted: true, updatedAtWall: now })
      .where(eq(schema.pluses.id, id));
    addPendingChange('pluse', 'update', id);
    scheduleSyncPush();
  }
}
