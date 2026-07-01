import { db } from './drizzle-adapter';
import { todos, todoLogs } from './schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { createTodo, getTodo } from './todos';
import { getTodoLogs } from './todoLogs';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { todoToRow, rowToTodo } from './schema';
import {
  DEFAULT_TIME_SLOTS,
  getTimeSlotScheduleDate,
  newHLC,
  mergeHLC,
} from '../types';
import { getTimeSlotDefinitions } from './timeSlotDefinitions';
import type { TimeSlotConfig, Todo } from '../types';

function slotTodoId(slot: TimeSlotConfig): string {
  return slot.milestoneId;
}

async function migrateLegacyTodoToCanonical(
  legacy: Todo,
  canonicalId: string
): Promise<void> {
  const logs = await getTodoLogs(legacy.id);
  for (const log of logs) {
    const nodeId = await getOrCreateDeviceId();
    const mergedUpdatedAt = log.updatedAt
      ? mergeHLC(log.updatedAt, newHLC(nodeId))
      : newHLC(nodeId);
    await db
      .update(todoLogs)
      .set({
        todoId: canonicalId,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todoLogs.id, log.id));
    syncLocalChange('todoLogs', 'update', log.id).catch(() => {});
  }

  const nodeId = await getOrCreateDeviceId();
  const tombstoneHLC = newHLC(nodeId);
  const mergedUpdatedAt = legacy.updatedAt
    ? mergeHLC(legacy.updatedAt, tombstoneHLC)
    : tombstoneHLC;
  await db
    .update(todos)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(todos.id, legacy.id));
  syncLocalChange('todos', 'delete', legacy.id).catch(() => {});
}

export async function getTimeSlotTodo(slot: TimeSlotConfig): Promise<Todo | undefined> {
  return getTodo(slotTodoId(slot));
}

export async function ensureTimeSlotTodo(
  slot: TimeSlotConfig,
  date = new Date()
): Promise<string> {
  const id = slotTodoId(slot);
  const scheduledDate = getTimeSlotScheduleDate(slot, date);
  let existing = await getTodo(id);

  // Fallback: the slot may already exist at this scheduled time under a
  // different id. Decide existence by the slot's time and migrate to the
  // canonical id.
  if (!existing) {
    const dayStart = new Date(scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const rows = (await db
      .select()
      .from(todos)
      .where(
        and(
          eq(todos.isDeleted, false),
          eq(todos.pattern, 'timeSlot'),
          gte(todos.scheduledDate, dayStart),
          lt(todos.scheduledDate, dayEnd)
        )
      )) as any[];

    existing = rows
      .map(rowToTodo)
      .find((t) => t.scheduledDate?.getTime() === scheduledDate.getTime());

    if (existing && existing.id !== id) {
      await migrateLegacyTodoToCanonical(existing, id);
      existing = undefined;
    }
  }

  if (existing) {
    const scheduledMs = existing.scheduledDate?.getTime();
    const needsUpdate =
      existing.pattern !== 'timeSlot' ||
      existing.isSystemTask !== true ||
      existing.title !== slot.title ||
      scheduledMs !== scheduledDate.getTime();

    if (needsUpdate) {
      const nodeId = await getOrCreateDeviceId();
      const mergedUpdatedAt = existing.updatedAt
        ? mergeHLC(existing.updatedAt, newHLC(nodeId))
        : newHLC(nodeId);

      await db
        .update(todos)
        .set(
          todoToRow({
            id,
            pattern: 'timeSlot',
            isSystemTask: true,
            title: slot.title,
            scheduledDate,
            updatedAt: mergedUpdatedAt,
          } as Partial<Todo>)
        )
        .where(eq(todos.id, id));
      syncLocalChange('todos', 'update', id).catch(() => {});
    }

    return id;
  }

  await createTodo(slot.title, {
    id,
    nodeType: 'task',
    pattern: 'timeSlot',
    status: 'done',
    scheduledDate,
    isSystemTask: true,
    description: '',
  });

  return id;
}

export async function migrateLegacySlotTodos(date = new Date()): Promise<void> {
  let slots: TimeSlotConfig[] = await getTimeSlotDefinitions();
  if (slots.length === 0) {
    slots = DEFAULT_TIME_SLOTS;
  }

  const rows = (await db
    .select()
    .from(todos)
    .where(and(eq(todos.isDeleted, false), eq(todos.isSystemTask, true)))) as any[];
  const systemTodos = rows.map(rowToTodo);

  const slotTitles = new Set(slots.map((s) => s.title));
  const legacyByTitle = new Map<string, Todo[]>();

  for (const todo of systemTodos) {
    if (!slotTitles.has(todo.title)) continue;
    const list = legacyByTitle.get(todo.title) ?? [];
    list.push(todo);
    legacyByTitle.set(todo.title, list);
  }

  for (const slot of slots) {
    const legacy = legacyByTitle.get(slot.title) ?? [];
    if (legacy.length === 0) continue;

    const canonicalId = await ensureTimeSlotTodo(slot, date);

    for (const todo of legacy) {
      if (todo.id === canonicalId) continue;

      await migrateLegacyTodoToCanonical(todo, canonicalId);
    }
  }
}
