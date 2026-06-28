import { db } from './drizzle-adapter';
import { repeatOccurrences, todos } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { createTodo } from './todos';
import { newHLC, mergeHLC, makeVirtualTodoId } from '../types';
import type { RepeatOccurrence, Todo, TodoStatus } from '../types';
import { repeatOccurrenceToRow, rowToRepeatOccurrence, rowToTodo } from './schema';

export async function getOccurrence(
  templateId: string,
  date: Date
): Promise<RepeatOccurrence | undefined> {
  const id = makeVirtualTodoId(templateId, date);
  const rows = await db.select().from(repeatOccurrences).where(
    eq(repeatOccurrences.id, id)
  ) as any[];
  const row = rows[0];
  return row ? rowToRepeatOccurrence(row) : undefined;
}

export async function getOccurrencesForTemplate(
  templateId: string
): Promise<RepeatOccurrence[]> {
  const rows = await db.select().from(repeatOccurrences).where(
    eq(repeatOccurrences.templateId, templateId)
  ) as any[];
  return rows.map(rowToRepeatOccurrence);
}

export async function getOccurrencesForDateRange(
  templateId: string,
  start: Date,
  end: Date
): Promise<RepeatOccurrence[]> {
  const all = await getOccurrencesForTemplate(templateId);
  const startTime = new Date(start).setHours(0, 0, 0, 0);
  const endTime = new Date(end).setHours(0, 0, 0, 0);
  return all.filter((o) => {
    const d = new Date(o.date).setHours(0, 0, 0, 0);
    return d >= startTime && d <= endTime;
  });
}

export async function setOccurrenceStatus(
  templateId: string,
  date: Date,
  status: TodoStatus
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const now = new Date();
  const id = makeVirtualTodoId(templateId, date);
  const rows = await db.select().from(repeatOccurrences).where(
    eq(repeatOccurrences.id, id)
  ) as any[];
  const existing = rows[0] ? rowToRepeatOccurrence(rows[0]) : undefined;

  if (existing) {
    const mergedUpdatedAt = existing.updatedAt
      ? mergeHLC(existing.updatedAt, hlc)
      : hlc;
    const updateData: Record<string, unknown> = {
      status,
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    };
    if (status === 'done') updateData.completed_at = now;
    else updateData.completed_at = null;
    await db.update(repeatOccurrences).set(updateData as any).where(
      eq(repeatOccurrences.id, id)
    );
    onLocalChange('repeatOccurrences', 'update', id).catch(() => {});
  } else {
    const occurrence: RepeatOccurrence = {
      id,
      templateId,
      date: new Date(date),
      status,
      completedAt: status === 'done' ? now : undefined,
      createdAt: hlc,
      updatedAt: hlc,
      isDeleted: false,
    };
    await db.insert(repeatOccurrences).values(repeatOccurrenceToRow(occurrence) as any);
    onLocalChange('repeatOccurrences', 'create', id).catch(() => {});
  }
}

export async function materializeInstance(
  template: Todo,
  date: Date
): Promise<Todo> {
  const occurrence = await getOccurrence(template.id, date);

  if (occurrence?.materializedTodoId) {
    const rows = await db.select().from(todos).where(
      eq(todos.id, occurrence.materializedTodoId)
    ) as any[];
    const existing = rows[0] ? rowToTodo(rows[0]) : undefined;
    if (existing) return existing;
  }

  const instance = await createTodo(template.title, {
    description: template.description,
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    tags: [...template.tags],
    scheduledDate: new Date(date),
    status: occurrence?.status ?? 'pending',
  });

  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const id = makeVirtualTodoId(template.id, date);

  if (occurrence) {
    const mergedUpdatedAt = occurrence.updatedAt
      ? mergeHLC(occurrence.updatedAt, hlc)
      : hlc;
    await db.update(repeatOccurrences).set({
      materialized_todo_id: instance.id,
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    } as any).where(eq(repeatOccurrences.id, id));
    onLocalChange('repeatOccurrences', 'update', id).catch(() => {});
  } else {
    await db.insert(repeatOccurrences).values(repeatOccurrenceToRow({
      id,
      templateId: template.id,
      date: new Date(date),
      status: instance.status ?? 'pending',
      materializedTodoId: instance.id,
      createdAt: hlc,
      updatedAt: hlc,
    }) as any);
    onLocalChange('repeatOccurrences', 'create', id).catch(() => {});
  }

  return instance;
}

export async function deleteOccurrence(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const rows = await db.select().from(repeatOccurrences).where(
    eq(repeatOccurrences.id, id)
  ) as any[];
  const existing = rows[0] ? rowToRepeatOccurrence(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.update(repeatOccurrences).set({
    is_deleted: true,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(repeatOccurrences.id, id));
  onLocalChange('repeatOccurrences', 'delete', id).catch(() => {});
}

export async function deleteOccurrencesForTemplate(templateId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const occurrences = await getOccurrencesForTemplate(templateId);
  for (const o of occurrences) {
    const mergedUpdatedAt = o.updatedAt
      ? mergeHLC(o.updatedAt, hlc)
      : hlc;
    await db.update(repeatOccurrences).set({
      is_deleted: true,
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    } as any).where(eq(repeatOccurrences.id, o.id));
    onLocalChange('repeatOccurrences', 'delete', o.id).catch(() => {});
  }
}
