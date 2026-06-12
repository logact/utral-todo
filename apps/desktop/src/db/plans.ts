import { db } from './database';
import { onLocalChange } from './syncEngine';
import type { Plan } from '../types';

export async function getPlan(id: string): Promise<Plan | undefined> {
  return db.plans.get(id);
}

export async function getPlansForGoal(goalTodoId: string): Promise<Plan[]> {
  return db.plans.where('goalTodoId').equals(goalTodoId).toArray();
}

export async function createPlan(
  goalTodoId: string,
  title: string,
  todoIds: string[] = []
): Promise<Plan> {
  const now = new Date();
  const plan: Plan = {
    id: crypto.randomUUID(),
    goalTodoId,
    title: title.trim() || 'Untitled Plan',
    todoIds,
    createdAt: now,
    updatedAt: now,
  };
  await db.plans.add(plan);
  onLocalChange('plans', 'create', plan.id).catch(() => {});
  return plan;
}

export async function updatePlan(
  id: string,
  updates: Partial<Omit<Plan, 'id' | 'createdAt'>>
): Promise<void> {
  await db.plans.update(id, { ...updates, updatedAt: new Date() });
  onLocalChange('plans', 'update', id).catch(() => {});
}

export async function deletePlan(id: string): Promise<void> {
  const plan = await db.plans.get(id);
  if (!plan) return;

  const goal = await db.todos.get(plan.goalTodoId);
  const isActive = goal?.activePlanId === id;

  await db.plans.delete(id);
  onLocalChange('plans', 'delete', id).catch(() => {});

  if (isActive) {
    const remaining = await getPlansForGoal(plan.goalTodoId);
    let newActive: Plan;
    if (remaining.length > 0) {
      newActive = remaining[0];
    } else {
      newActive = await createPlan(plan.goalTodoId, 'Default Plan');
    }
    await db.todos.update(plan.goalTodoId, { activePlanId: newActive.id });
    onLocalChange('todos', 'update', plan.goalTodoId).catch(() => {});
  }
}

export async function addTodoToPlan(planId: string, todoId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (!plan) return;
  if (plan.todoIds.includes(todoId)) return;
  await db.plans.update(planId, {
    todoIds: [...plan.todoIds, todoId],
    updatedAt: new Date(),
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function removeTodoFromPlan(planId: string, todoId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (!plan) return;
  if (todoId === plan.goalTodoId) return;
  const newTodoIds = plan.todoIds.filter((tid) => tid !== todoId);
  await db.plans.update(planId, {
    todoIds: newTodoIds,
    updatedAt: new Date(),
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}
