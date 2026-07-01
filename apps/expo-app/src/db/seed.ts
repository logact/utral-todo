import { eq } from 'drizzle-orm';
import { newHLC } from '@utral/sync-share';
import { todoToRow, planToRow } from '@utral/db-schema';
import type { Todo, Plan } from '@utral/types';
import { db, schema } from '../db';
import { getDeviceId } from '../lib/database';
import { addPendingChange, scheduleSyncPush } from '../lib/auto-sync';

export const ROOT_GOAL_ID = 'system:root-goal';
const ROOT_PLAN_ID = 'system:root-plan';

export async function ensureRootGoal(): Promise<void> {
  const existing = await db
    .select()
    .from(schema.todos)
    .where(eq(schema.todos.id, ROOT_GOAL_ID))
    .limit(1);
  if (existing.length > 0) return;

  const deviceId = await getDeviceId();
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

  await db.insert(schema.todos).values(todoToRow(rootGoal));
  addPendingChange('todo', 'create', rootGoal.id);

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

  await db.insert(schema.plans).values(planToRow(plan));

  await db
    .update(schema.todos)
    .set({
      activePlanId: plan.id,
      updatedAtWall: hlc.wall,
      updatedAtCounter: hlc.counter,
      updatedAtNode: hlc.node,
    })
    .where(eq(schema.todos.id, rootGoal.id));

  addPendingChange('todo', 'update', rootGoal.id);
  scheduleSyncPush();
}
