import { eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Pluse } from './database';

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getAllPluses(): Promise<Pluse[]> {
  const rows = await db
    .select()
    .from(schema.pluses)
    .where(isNull(schema.pluses.deletedAt));
  return rows as Pluse[];
}

export async function getPluse(id: string): Promise<Pluse | null> {
  const rows = await db.select().from(schema.pluses).where(eq(schema.pluses.id, id)).limit(1);
  return rows.length > 0 ? (rows[0] as Pluse) : null;
}

export async function createPluse(data: Partial<Pluse>): Promise<Pluse> {
  const id = generateId();
  const timestamp = now();
  const pluse = {
    id,
    name: data.name || 'Untitled Pluse',
    description: data.description || '',
    intervals: data.intervals || [1500],
    repeatCount: data.repeatCount || 1,
    autoAdvance: data.autoAdvance ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.insert(schema.pluses).values(pluse);
  return pluse as Pluse;
}

export async function updatePluse(id: string, updates: Partial<Pluse>): Promise<Pluse | null> {
  const existing = await getPluse(id);
  if (!existing) return null;
  const { id: _, createdAt: _c, ...updateFields } = updates as any;
  await db
    .update(schema.pluses)
    .set({ ...updateFields, updatedAt: now() })
    .where(eq(schema.pluses.id, id));
  return getPluse(id);
}

export async function deletePluse(id: string): Promise<void> {
  const existing = await getPluse(id);
  if (existing) {
    const timestamp = now();
    await db
      .update(schema.pluses)
      .set({ deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(schema.pluses.id, id));
  }
}
