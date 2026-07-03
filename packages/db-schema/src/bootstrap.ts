// ─────────────────────────────────────────────────────────────────────────────
// Shared startup bootstrap for Utral Todo clients.
//
// When the app starts with an empty (or partially empty) database, this module
// creates the system records every client needs:
//   - root goal + root plan
//   - default time slot definitions
//   - a default pluse
//   - boundary milestone todos for the time slots
//
// Every write is followed by a notifyDbOperation call so the records propagate
// to the user's other devices. The bootstrap is idempotent: running it again on
// a non-empty database is a no-op.
// ─────────────────────────────────────────────────────────────────────────────
import { eq } from 'drizzle-orm';
import { todos, plans, pluses, timeSlots } from './schema.js';
import {
  todoToRow,
  planToRow,
  pluseToRow,
  timeSlotDefinitionToRow,
} from './converters.js';
import {
  getTimeSlotDefinitions as engineGetTimeSlotDefinitions,
  ensureTimeSlotTodo as engineEnsureTimeSlotTodo,
  migrateLegacySlotTodos as engineMigrateLegacySlotTodos,
  type TimeSlotStore,
} from './timeSlotEngine.js';
import { newHLC } from '@utral/sync-share';
import { DEFAULT_TIME_SLOTS } from '@utral/types';
import type { Todo, Plan, Pluse, TimeSlotDefinition } from '@utral/types';
import type { DbStore } from './store.js';

export interface BootstrapStore extends DbStore {
  /** Optional hook called after bootstrap completes successfully. */
  onComplete?(): void;
}

export const ROOT_GOAL_ID = 'system:root-goal';
export const ROOT_PLAN_ID = 'system:root-plan';
export const DEFAULT_PLUSE_ID = 'system:default-pluse';

// ─── Root goal + root plan ───────────────────────────────────────────────────

async function ensureRootGoal(store: BootstrapStore): Promise<void> {
  const existing = await store.db
    .select()
    .from(todos)
    .where(eq(todos.id, ROOT_GOAL_ID))
    .limit(1);

  if (existing.length > 0) return;

  const deviceId = store.deviceId;
  const hlc = newHLC(deviceId);

  const rootGoal: Todo = {
    id: ROOT_GOAL_ID,
    nodeType: 'goal',
    title: 'Root Goal',
    description: '',
    isRootGoal: true,
    goalStatus: 'active',
    status: 'pending',
    priority: 'medium',
    estimatedMinutes: 60,
    tags: [],
    order: 0,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };

  await store.db.insert(todos).values(todoToRow(rootGoal));
  store.notifyDbOperation('todos', 'create', rootGoal.id);

  const plan: Plan = {
    id: ROOT_PLAN_ID,
    goalTodoId: rootGoal.id,
    title: 'Root Road',
    nodeIds: [],
    edgeIds: [],
    isSystemPlan: true,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };

  await store.db.insert(plans).values(planToRow(plan));
  store.notifyDbOperation('plans', 'create', plan.id);

  await store.db
    .update(todos)
    .set({
      activePlanId: plan.id,
      updatedAtWall: hlc.wall,
      updatedAtCounter: hlc.counter,
      updatedAtNode: hlc.node,
    })
    .where(eq(todos.id, rootGoal.id));

  store.notifyDbOperation('todos', 'update', rootGoal.id);
}

// ─── Default time slot definitions ───────────────────────────────────────────

async function seedDefaultTimeSlotsSyncAware(store: BootstrapStore): Promise<void> {
  const deviceId = store.deviceId;

  for (let i = 0; i < DEFAULT_TIME_SLOTS.length; i++) {
    const slot = DEFAULT_TIME_SLOTS[i];

    const existing = await store.db
      .select()
      .from(timeSlots)
      .where(eq(timeSlots.id, slot.id))
      .limit(1);

    if (existing.length > 0) continue;

    const hlc = newHLC(deviceId);
    const definition: TimeSlotDefinition = {
      ...slot,
      order: i,
      createdAt: hlc,
      updatedAt: hlc,
      isDeleted: false,
    };

    await store.db
      .insert(timeSlots)
      .values(timeSlotDefinitionToRow(definition))
      .onConflictDoNothing({ target: timeSlots.id });

    store.notifyDbOperation('timeSlots', 'create', slot.id);
  }
}

// ─── Default pluse ───────────────────────────────────────────────────────────

async function ensureDefaultPluse(store: BootstrapStore): Promise<void> {
  const existing = await store.db
    .select()
    .from(pluses)
    .where(eq(pluses.id, DEFAULT_PLUSE_ID))
    .limit(1);

  if (existing.length > 0) return;

  const deviceId = store.deviceId;
  const hlc = newHLC(deviceId);

  const pluse: Pluse = {
    id: DEFAULT_PLUSE_ID,
    name: 'Focus',
    description: '',
    intervals: [1500],
    repeatCount: 1,
    autoAdvance: true,
    timerStatus: 'idle',
    currentIntervalIndex: 0,
    accumulatedSeconds: 0,
    isActive: true,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };

  await store.db.insert(pluses).values(pluseToRow(pluse));
  store.notifyDbOperation('pluses', 'create', pluse.id);
}

// ─── TimeSlot boundary milestone todos ───────────────────────────────────────

function buildTimeSlotStore(store: BootstrapStore): TimeSlotStore {
  return store;
}

async function ensureTimeSlotBoundaryTodos(store: BootstrapStore): Promise<void> {
  const timeSlotStore = buildTimeSlotStore(store);
  const definitions = await engineGetTimeSlotDefinitions(timeSlotStore);
  const slots = definitions.length > 0 ? definitions : DEFAULT_TIME_SLOTS;

  const today = new Date();
  for (const slot of slots) {
    await engineEnsureTimeSlotTodo(timeSlotStore, slot, today);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Idempotent startup bootstrap. Creates system records when the local database
 * is empty and notifies sync for every mutation so other devices receive them.
 */
export async function bootstrapApp(store: BootstrapStore): Promise<void> {
  await ensureRootGoal(store);
  await seedDefaultTimeSlotsSyncAware(store);
  await ensureDefaultPluse(store);
  await ensureTimeSlotBoundaryTodos(store);
  await engineMigrateLegacySlotTodos(store);

  store.onComplete?.();
}

export { ensureRootGoal };
