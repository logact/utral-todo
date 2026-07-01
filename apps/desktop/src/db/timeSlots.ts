import { db } from './drizzle-adapter';
import { todos, todoLogs } from './schema';
import { eq, and } from 'drizzle-orm';
import { createTodo, getTodo } from './todos';
import { getTodoLogs } from './todoLogs';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { todoToRow, rowToTodo } from './schema';
import {
  DEFAULT_TIME_SLOTS,
  getTimeSlotMilestoneId,
  getTimeSlotStartMilestoneId,
  newHLC,
  mergeHLC,
} from '../types';
import { getTimeSlotDefinitions } from './timeSlotDefinitions';
import type { TimeSlotConfig, Todo } from '../types';

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

export async function getTimeSlotTodo(
  slot: TimeSlotConfig
): Promise<Todo | undefined> {
  return getTodo(getTimeSlotStartMilestoneId(slot));
}

/**
 * Ensure a single boundary milestone todo exists for the given time-of-day.
 * The id and title are `timeslot:HHmm` — a pure function of the time, so
 * adjacent slots that share a boundary share one todo.
 */
async function ensureMilestoneTodo(
  hour: number,
  minute: number,
  date: Date
): Promise<string> {
  const id = getTimeSlotMilestoneId(hour, minute);
  const scheduledDate = new Date(date);
  scheduledDate.setHours(hour, minute, 0, 0);

  const existing = await getTodo(id);

  if (existing) {
    const scheduledMs = existing.scheduledDate?.getTime();
    const needsUpdate =
      existing.pattern !== 'timeSlot' ||
      existing.isSystemTask !== true ||
      existing.title !== id ||
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
            title: id,
            scheduledDate,
            updatedAt: mergedUpdatedAt,
          } as Partial<Todo>)
        )
        .where(eq(todos.id, id));
      syncLocalChange('todos', 'update', id).catch(() => {});
    }

    return id;
  }

  await createTodo(id, {
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

/**
 * Ensure both boundary todos (start + end) exist for a slot and return the
 * start boundary id. Adjacent slots that share a boundary reuse the same todo.
 */
export async function ensureTimeSlotTodo(
  slot: TimeSlotConfig,
  date = new Date()
): Promise<string> {
  const startId = await ensureMilestoneTodo(slot.startHour, slot.startMinute, date);
  await ensureMilestoneTodo(slot.endHour, slot.endMinute, date);
  return startId;
}

export async function migrateLegacySlotTodos(): Promise<void> {
  let slots: TimeSlotConfig[] = await getTimeSlotDefinitions();
  if (slots.length === 0) {
    slots = DEFAULT_TIME_SLOTS;
  }

  const rows = (await db
    .select()
    .from(todos)
    .where(and(eq(todos.isDeleted, false), eq(todos.isSystemTask, true)))) as any[];
  const systemTodos = rows.map(rowToTodo);

  const slotByTitle = new Map(slots.map((s) => [s.title, s]));

  for (const todo of systemTodos) {
    const slot = slotByTitle.get(todo.title);
    if (!slot) continue;

    // Re-home legacy slot todos (old `system:*` ids, random UUIDs) to the
    // start-boundary milestone id, carrying their notes over.
    const canonicalId = getTimeSlotStartMilestoneId(slot);
    if (todo.id === canonicalId) continue;

    await migrateLegacyTodoToCanonical(todo, canonicalId);
  }
}
