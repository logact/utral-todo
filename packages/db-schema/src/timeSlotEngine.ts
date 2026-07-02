// ─────────────────────────────────────────────────────────────────────────────
// Storage-injected time-slot engine, shared by desktop and expo.
//
// The generation logic used to live in apps/desktop/src/db/{timeSlots,
// timeSlotDefinitions}.ts, coupled to desktop's own db helpers. It is ported
// here to operate on any Drizzle db over the shared @utral/db-schema tables via
// a `TimeSlotStore` context, so both apps drive the exact same logic.
//
// Boundary "milestone" todos have deterministic ids `timeslot:HHmm` (a pure
// function of the time), so adjacent slots that share a boundary share one todo.
// ─────────────────────────────────────────────────────────────────────────────
import { eq, and, asc } from 'drizzle-orm';
import { todos, todoLogs, timeSlots } from './schema.js';
import {
  timeSlotDefinitionToRow,
  rowToTimeSlotDefinition,
  rowToTodo,
  todoToRow,
} from './converters.js';
import {
  DEFAULT_TIME_SLOTS,
  getTimeSlotMilestoneId,
  getTimeSlotStartMilestoneId,
} from '@utral/types';
import type { TimeSlotConfig, TimeSlotDefinition, Todo } from '@utral/types';
import { newHLC, mergeHLC } from '@utral/sync-share';

/** Canonical entity names the engine reports changes for. Each app maps these
 *  to its own sync-tracking convention. */
export type TimeSlotEntity = 'todo' | 'todoLog' | 'timeSlot';

export interface TimeSlotStore {
  /** Drizzle db instance over the shared @utral/db-schema tables. */
  db: any;
  /** Resolve the local device/node id used to stamp HLCs. */
  getDeviceId(): Promise<string>;
  /** Record a local mutation so the app's sync layer can push it. */
  trackChange(entity: TimeSlotEntity, op: 'create' | 'update' | 'delete', id: string): void;
}

// ─── Definitions (time_slots table) ──────────────────────────────────────────

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

export async function seedDefaultTimeSlots(ctx: TimeSlotStore): Promise<void> {
  const nodeId = await ctx.getDeviceId();

  for (let i = 0; i < DEFAULT_TIME_SLOTS.length; i++) {
    const slot = DEFAULT_TIME_SLOTS[i];

    // Skip already-seeded slots so we don't emit redundant sync events on every
    // app restart.
    const existing = await ctx.db
      .select()
      .from(timeSlots)
      .where(eq(timeSlots.id, slot.id))
      .limit(1);

    if (existing.length > 0) continue;

    const definition = slotConfigToDefinition(slot, i, nodeId);

    await ctx.db
      .insert(timeSlots)
      .values(timeSlotDefinitionToRow(definition))
      .onConflictDoNothing({ target: timeSlots.id });

    ctx.trackChange('timeSlot', 'create', slot.id);
  }
}

export async function getTimeSlotDefinitions(
  ctx: TimeSlotStore
): Promise<TimeSlotDefinition[]> {
  const rows = await ctx.db
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.isDeleted, false))
    .orderBy(asc(timeSlots.order));

  return rows.map(rowToTimeSlotDefinition);
}

export async function getTimeSlotDefinitionByMilestoneId(
  ctx: TimeSlotStore,
  milestoneId: string
): Promise<TimeSlotDefinition | undefined> {
  const rows = await ctx.db
    .select()
    .from(timeSlots)
    .where(and(eq(timeSlots.isDeleted, false), eq(timeSlots.milestoneId, milestoneId)))
    .limit(1);

  return rows[0] ? rowToTimeSlotDefinition(rows[0]) : undefined;
}

export async function getTimeSlotDefinitionById(
  ctx: TimeSlotStore,
  id: string
): Promise<TimeSlotDefinition | undefined> {
  const rows = await ctx.db
    .select()
    .from(timeSlots)
    .where(and(eq(timeSlots.isDeleted, false), eq(timeSlots.id, id)))
    .limit(1);

  return rows[0] ? rowToTimeSlotDefinition(rows[0]) : undefined;
}

export async function updateTimeSlotDefinition(
  ctx: TimeSlotStore,
  id: string,
  changes: Partial<Omit<TimeSlotDefinition, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>>
): Promise<void> {
  const existing = await getTimeSlotDefinitionById(ctx, id);
  if (!existing) return;

  const nodeId = await ctx.getDeviceId();
  const updatedAt = mergeHLC(existing.updatedAt, newHLC(nodeId));

  const row = timeSlotDefinitionToRow({
    ...existing,
    ...changes,
    updatedAt,
  });

  await ctx.db.update(timeSlots).set(row).where(eq(timeSlots.id, id));
  ctx.trackChange('timeSlot', 'update', id);
}

export async function deleteTimeSlotDefinition(
  ctx: TimeSlotStore,
  id: string
): Promise<void> {
  const existing = await getTimeSlotDefinitionById(ctx, id);
  if (!existing) return;

  const nodeId = await ctx.getDeviceId();
  const updatedAt = mergeHLC(existing.updatedAt, newHLC(nodeId));

  await ctx.db
    .update(timeSlots)
    .set({
      isDeleted: true,
      updatedAtWall: updatedAt.wall,
      updatedAtCounter: updatedAt.counter,
      updatedAtNode: updatedAt.node,
    })
    .where(eq(timeSlots.id, id));
  ctx.trackChange('timeSlot', 'delete', id);
}

// ─── Boundary milestone todos ────────────────────────────────────────────────

async function getTodoById(
  ctx: TimeSlotStore,
  id: string
): Promise<Todo | undefined> {
  const rows = (await ctx.db.select().from(todos).where(eq(todos.id, id))) as any[];
  return rows[0] ? rowToTodo(rows[0]) : undefined;
}

export async function getTimeSlotTodo(
  ctx: TimeSlotStore,
  slot: TimeSlotConfig
): Promise<Todo | undefined> {
  return getTodoById(ctx, getTimeSlotStartMilestoneId(slot));
}

/**
 * Ensure a single boundary milestone todo exists for the given time-of-day.
 * The id and title are `timeslot:HHmm` — a pure function of the time, so
 * adjacent slots that share a boundary share one todo.
 */
async function ensureMilestoneTodo(
  ctx: TimeSlotStore,
  hour: number,
  minute: number,
  date: Date
): Promise<string> {
  const id = getTimeSlotMilestoneId(hour, minute);
  const scheduledDate = new Date(date);
  scheduledDate.setHours(hour, minute, 0, 0);

  const existing = await getTodoById(ctx, id);

  if (existing) {
    const scheduledMs = existing.scheduledDate?.getTime();
    const needsUpdate =
      existing.pattern !== 'timeSlot' ||
      existing.isSystemTask !== true ||
      existing.title !== id ||
      scheduledMs !== scheduledDate.getTime();

    if (needsUpdate) {
      const nodeId = await ctx.getDeviceId();
      const mergedUpdatedAt = existing.updatedAt
        ? mergeHLC(existing.updatedAt, newHLC(nodeId))
        : newHLC(nodeId);

      await ctx.db
        .update(todos)
        .set(
          todoToRow({
            id,
            pattern: 'timeSlot',
            isSystemTask: true,
            title: id,
            scheduledDate,
            updatedAt: mergedUpdatedAt,
          })
        )
        .where(eq(todos.id, id));
      ctx.trackChange('todo', 'update', id);
    }

    return id;
  }

  const nodeId = await ctx.getDeviceId();
  const hlc = newHLC(nodeId);
  const todo: Todo = {
    id,
    nodeType: 'task',
    pattern: 'timeSlot',
    title: id,
    description: '',
    status: 'done',
    priority: 'medium',
    estimatedMinutes: 60,
    scheduledDate,
    isSystemTask: true,
    tags: [],
    order: 0,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };

  await ctx.db.insert(todos).values(todoToRow(todo));
  ctx.trackChange('todo', 'create', id);

  return id;
}

/**
 * Ensure both boundary todos (start + end) exist for a slot and return the
 * start boundary id. Adjacent slots that share a boundary reuse the same todo.
 */
export async function ensureTimeSlotTodo(
  ctx: TimeSlotStore,
  slot: TimeSlotConfig,
  date = new Date()
): Promise<string> {
  const startId = await ensureMilestoneTodo(ctx, slot.startHour, slot.startMinute, date);
  await ensureMilestoneTodo(ctx, slot.endHour, slot.endMinute, date);
  return startId;
}

// ─── Legacy migration ────────────────────────────────────────────────────────

async function migrateLegacyTodoToCanonical(
  ctx: TimeSlotStore,
  legacy: Todo,
  canonicalId: string
): Promise<void> {
  const logs = await ctx.db
    .select()
    .from(todoLogs)
    .where(eq(todoLogs.todoId, legacy.id));

  for (const log of logs) {
    const nodeId = await ctx.getDeviceId();
    const existingUpdatedAt =
      log.updatedAtWall != null
        ? { wall: log.updatedAtWall, counter: log.updatedAtCounter ?? 0, node: log.updatedAtNode ?? '' }
        : undefined;
    const mergedUpdatedAt = existingUpdatedAt
      ? mergeHLC(existingUpdatedAt, newHLC(nodeId))
      : newHLC(nodeId);
    await ctx.db
      .update(todoLogs)
      .set({
        todoId: canonicalId,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todoLogs.id, log.id));
    ctx.trackChange('todoLog', 'update', log.id);
  }

  const nodeId = await ctx.getDeviceId();
  const tombstoneHLC = newHLC(nodeId);
  const mergedUpdatedAt = legacy.updatedAt
    ? mergeHLC(legacy.updatedAt, tombstoneHLC)
    : tombstoneHLC;
  await ctx.db
    .update(todos)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(todos.id, legacy.id));
  ctx.trackChange('todo', 'delete', legacy.id);
}

export async function migrateLegacySlotTodos(ctx: TimeSlotStore): Promise<void> {
  let slots: TimeSlotConfig[] = await getTimeSlotDefinitions(ctx);
  if (slots.length === 0) {
    slots = DEFAULT_TIME_SLOTS;
  }

  const rows = (await ctx.db
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

    await migrateLegacyTodoToCanonical(ctx, todo, canonicalId);
  }
}
