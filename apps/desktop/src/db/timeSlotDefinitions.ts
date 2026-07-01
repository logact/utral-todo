import { db } from './drizzle-adapter';
import { timeSlots } from './schema';
import {
  timeSlotDefinitionToRow,
  rowToTimeSlotDefinition,
} from './schema';
import { eq, and, asc } from 'drizzle-orm';
import {
  DEFAULT_TIME_SLOTS,
  newHLC,
  mergeHLC,
} from '../types';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import type { TimeSlotDefinition, TimeSlotConfig } from '../types';

export type { TimeSlotDefinition, TimeSlotConfig };

function slotConfigToDefinition(
  slot: TimeSlotConfig,
  order: number,
  nodeId: string
): TimeSlotDefinition {
  const now = newHLC(nodeId);
  return {
    ...slot,
    order,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
}

export async function seedDefaultTimeSlots(nodeId?: string): Promise<void> {
  const id = nodeId ?? (await getOrCreateDeviceId());

  for (let i = 0; i < DEFAULT_TIME_SLOTS.length; i++) {
    const slot = DEFAULT_TIME_SLOTS[i];
    const definition = slotConfigToDefinition(slot, i, id);

    await db
      .insert(timeSlots)
      .values(timeSlotDefinitionToRow(definition))
      .onConflictDoNothing({ target: timeSlots.id });
  }
}

export async function getTimeSlotDefinitions(): Promise<TimeSlotDefinition[]> {
  const rows = await db
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.isDeleted, false))
    .orderBy(asc(timeSlots.order));

  return rows.map(rowToTimeSlotDefinition);
}

export async function getTimeSlotDefinitionByMilestoneId(
  milestoneId: string
): Promise<TimeSlotDefinition | undefined> {
  const rows = await db
    .select()
    .from(timeSlots)
    .where(and(eq(timeSlots.isDeleted, false), eq(timeSlots.milestoneId, milestoneId)))
    .limit(1);

  return rows[0] ? rowToTimeSlotDefinition(rows[0]) : undefined;
}

export async function getTimeSlotDefinitionById(
  id: string
): Promise<TimeSlotDefinition | undefined> {
  const rows = await db
    .select()
    .from(timeSlots)
    .where(and(eq(timeSlots.isDeleted, false), eq(timeSlots.id, id)))
    .limit(1);

  return rows[0] ? rowToTimeSlotDefinition(rows[0]) : undefined;
}

export async function updateTimeSlotDefinition(
  id: string,
  changes: Partial<Omit<TimeSlotDefinition, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>>
): Promise<void> {
  const existing = await getTimeSlotDefinitionById(id);
  if (!existing) return;

  const nodeId = await getOrCreateDeviceId();
  const updatedAt = mergeHLC(existing.updatedAt, newHLC(nodeId));

  const row = timeSlotDefinitionToRow({
    ...existing,
    ...changes,
    updatedAt,
  });

  await db.update(timeSlots).set(row).where(eq(timeSlots.id, id));
  syncLocalChange('timeSlot', 'update', id).catch(() => {});
}

export async function deleteTimeSlotDefinition(id: string): Promise<void> {
  const existing = await getTimeSlotDefinitionById(id);
  if (!existing) return;

  const nodeId = await getOrCreateDeviceId();
  const tombstoneHLC = newHLC(nodeId);
  const updatedAt = mergeHLC(existing.updatedAt, tombstoneHLC);

  await db
    .update(timeSlots)
    .set({
      isDeleted: true,
      updatedAtWall: updatedAt.wall,
      updatedAtCounter: updatedAt.counter,
      updatedAtNode: updatedAt.node,
    })
    .where(eq(timeSlots.id, id));
  syncLocalChange('timeSlot', 'delete', id).catch(() => {});
}
