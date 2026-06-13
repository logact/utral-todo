import { db } from './database';
import { onLocalChange } from './syncEngine';
import { createTodo } from './todos';
import { makeVirtualTodoId } from '../types';
import type { RepeatOccurrence, Todo, TodoStatus } from '../types';

export async function getOccurrence(
  templateId: string,
  date: Date
): Promise<RepeatOccurrence | undefined> {
  const id = makeVirtualTodoId(templateId, date);
  return db.repeatOccurrences.get(id);
}

export async function getOccurrencesForTemplate(
  templateId: string
): Promise<RepeatOccurrence[]> {
  return db.repeatOccurrences.where('templateId').equals(templateId).toArray();
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
  const id = makeVirtualTodoId(templateId, date);
  const existing = await db.repeatOccurrences.get(id);
  const now = new Date();

  if (existing) {
    const updates: Partial<RepeatOccurrence> = { status, updatedAt: now };
    if (status === 'done') updates.completedAt = now;
    else updates.completedAt = undefined;
    await db.repeatOccurrences.update(id, updates);
    onLocalChange('repeatOccurrences', 'update', id).catch(() => {});
  } else {
    const occurrence: RepeatOccurrence = {
      id,
      templateId,
      date: new Date(date),
      status,
      completedAt: status === 'done' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await db.repeatOccurrences.add(occurrence);
    onLocalChange('repeatOccurrences', 'create', id).catch(() => {});
  }
}

export async function materializeInstance(
  template: Todo,
  date: Date
): Promise<Todo> {
  const occurrence = await getOccurrence(template.id, date);

  // If already materialized, return the existing todo
  if (occurrence?.materializedTodoId) {
    const existing = await db.todos.get(occurrence.materializedTodoId);
    if (existing) return existing;
  }

  // Create a real todo from the template
  const instance = await createTodo(template.title, {
    description: template.description,
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    tags: [...template.tags],
    scheduledDate: new Date(date),
    status: occurrence?.status ?? 'pending',
  });

  // Store the materialized reference
  const id = makeVirtualTodoId(template.id, date);
  const now = new Date();

  if (occurrence) {
    await db.repeatOccurrences.update(id, {
      materializedTodoId: instance.id,
      updatedAt: now,
    });
    onLocalChange('repeatOccurrences', 'update', id).catch(() => {});
  } else {
    await db.repeatOccurrences.add({
      id,
      templateId: template.id,
      date: new Date(date),
      status: instance.status ?? 'pending',
      materializedTodoId: instance.id,
      createdAt: now,
      updatedAt: now,
    });
    onLocalChange('repeatOccurrences', 'create', id).catch(() => {});
  }

  return instance;
}

export async function deleteOccurrence(id: string): Promise<void> {
  await db.repeatOccurrences.delete(id);
  onLocalChange('repeatOccurrences', 'delete', id).catch(() => {});
}

export async function deleteOccurrencesForTemplate(templateId: string): Promise<void> {
  const occurrences = await getOccurrencesForTemplate(templateId);
  for (const o of occurrences) {
    await db.repeatOccurrences.delete(o.id);
    onLocalChange('repeatOccurrences', 'delete', o.id).catch(() => {});
  }
}
