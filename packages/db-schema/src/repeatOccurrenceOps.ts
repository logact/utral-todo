import { eq } from 'drizzle-orm';
import { repeatOccurrences, todos } from './schema.js';
import { repeatOccurrenceToRow, rowToRepeatOccurrence, rowToTodo } from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import { makeVirtualTodoId } from '@utral/types';
import type { RepeatOccurrence, Todo, TodoStatus } from '@utral/types';
import { createTodo } from './todoOps.js';
import type { DbStore } from './store.js';

export async function getOccurrence(
  store: DbStore,
  templateId: string,
  date: Date
): Promise<RepeatOccurrence | undefined> {
  const id = makeVirtualTodoId(templateId, date);
  const rows = (await store.db
    .select()
    .from(repeatOccurrences)
    .where(eq(repeatOccurrences.id, id))) as any[];
  const row = rows[0];
  return row ? rowToRepeatOccurrence(row) : undefined;
}

export async function getOccurrencesForTemplate(
  store: DbStore,
  templateId: string
): Promise<RepeatOccurrence[]> {
  const rows = (await store.db
    .select()
    .from(repeatOccurrences)
    .where(eq(repeatOccurrences.templateId, templateId))) as any[];
  return rows.map(rowToRepeatOccurrence);
}

export async function getOccurrencesForDateRange(
  store: DbStore,
  templateId: string,
  start: Date,
  end: Date
): Promise<RepeatOccurrence[]> {
  const all = await getOccurrencesForTemplate(store, templateId);
  const startTime = new Date(start).setHours(0, 0, 0, 0);
  const endTime = new Date(end).setHours(0, 0, 0, 0);
  return all.filter((o) => {
    const d = new Date(o.date).setHours(0, 0, 0, 0);
    return d >= startTime && d <= endTime;
  });
}

export async function setOccurrenceStatus(
  store: DbStore,
  templateId: string,
  date: Date,
  status: TodoStatus
): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const now = new Date();
  const id = makeVirtualTodoId(templateId, date);
  const rows = (await store.db
    .select()
    .from(repeatOccurrences)
    .where(eq(repeatOccurrences.id, id))) as any[];
  const existing = rows[0] ? rowToRepeatOccurrence(rows[0]) : undefined;

  if (existing) {
    const mergedUpdatedAt = existing.updatedAt
      ? mergeHLC(existing.updatedAt, hlc)
      : hlc;
    const updateData = {
      status,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
      completedAt: status === 'done' ? now : null,
    };
    await store.db
      .update(repeatOccurrences)
      .set(updateData)
      .where(eq(repeatOccurrences.id, id));
    await store.notifyDbOperation('repeatOccurrences', 'update', id);
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
    await store.db
      .insert(repeatOccurrences)
      .values(repeatOccurrenceToRow(occurrence));
    await store.notifyDbOperation('repeatOccurrences', 'create', id);
  }
}

export async function materializeInstance(
  store: DbStore,
  template: Todo,
  date: Date
): Promise<Todo> {
  const occurrence = await getOccurrence(store, template.id, date);

  if (occurrence?.materializedTodoId) {
    const rows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, occurrence.materializedTodoId))) as any[];
    const existing = rows[0] ? rowToTodo(rows[0]) : undefined;
    if (existing) return existing;
  }

  const instance = await createTodo(store, template.title, {
    description: template.description,
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    tags: [...template.tags],
    scheduledDate: new Date(date),
    status: occurrence?.status ?? 'pending',
  });

  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const id = makeVirtualTodoId(template.id, date);

  if (occurrence) {
    const mergedUpdatedAt = occurrence.updatedAt
      ? mergeHLC(occurrence.updatedAt, hlc)
      : hlc;
    await store.db
      .update(repeatOccurrences)
      .set({
        materializedTodoId: instance.id,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(repeatOccurrences.id, id));
    await store.notifyDbOperation('repeatOccurrences', 'update', id);
  } else {
    await store.db
      .insert(repeatOccurrences)
      .values(
        repeatOccurrenceToRow({
          id,
          templateId: template.id,
          date: new Date(date),
          status: instance.status ?? 'pending',
          materializedTodoId: instance.id,
          createdAt: hlc,
          updatedAt: hlc,
        })
      );
    await store.notifyDbOperation('repeatOccurrences', 'create', id);
  }

  return instance;
}

export async function deleteOccurrence(store: DbStore, id: string): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const rows = (await store.db
    .select()
    .from(repeatOccurrences)
    .where(eq(repeatOccurrences.id, id))) as any[];
  const existing = rows[0] ? rowToRepeatOccurrence(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await store.db
    .update(repeatOccurrences)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(repeatOccurrences.id, id));
  await store.notifyDbOperation('repeatOccurrences', 'delete', id);
}

export async function deleteOccurrencesForTemplate(
  store: DbStore,
  templateId: string
): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const occurrences = await getOccurrencesForTemplate(store, templateId);
  for (const o of occurrences) {
    const mergedUpdatedAt = o.updatedAt
      ? mergeHLC(o.updatedAt, hlc)
      : hlc;
    await store.db
      .update(repeatOccurrences)
      .set({
        isDeleted: true,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(repeatOccurrences.id, o.id));
    await store.notifyDbOperation('repeatOccurrences', 'delete', o.id);
  }
}
