import { db } from './database';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
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
  nodeIds: string[] = []
): Promise<Plan> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const plan: Plan = {
    id: crypto.randomUUID(),
    goalTodoId,
    title: title.trim() || 'Untitled Plan',
    nodeIds,
    edgeIds: [],
    createdAt: hlc,
    updatedAt: hlc,
  };
  await db.plans.add(plan);
  onLocalChange('plans', 'create', plan.id).catch(() => {});
  return plan;
}

export async function updatePlan(
  id: string,
  updates: Partial<Omit<Plan, 'id' | 'createdAt'>>
): Promise<void> {
  const plan = await db.plans.get(id);
  if (plan?.isSystemPlan) {
    throw new Error('Cannot modify a system plan');
  }
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.plans.update(id, { ...updates, updatedAt: mergedUpdatedAt });
  onLocalChange('plans', 'update', id).catch(() => {});
}

export async function deletePlan(id: string): Promise<void> {
  const plan = await db.plans.get(id);
  if (!plan) return;
  if (plan.isSystemPlan) {
    throw new Error('Cannot delete a system plan');
  }

  const goal = await db.todos.get(plan.goalTodoId);
  const isActive = goal?.activePlanId === id;

  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, hlc)
    : hlc;
  await db.plans.update(id, { deletedAt: hlc, updatedAt: mergedUpdatedAt });
  onLocalChange('plans', 'delete', id).catch(() => {});

  if (isActive) {
    const remaining = await getPlansForGoal(plan.goalTodoId);
    let newActive: Plan;
    if (remaining.length > 0) {
      newActive = remaining[0];
    } else {
      newActive = await createPlan(plan.goalTodoId, 'Default Plan');
    }
    const goalMergedUpdatedAt = goal?.updatedAt
      ? mergeHLC(goal.updatedAt, newHLC(nodeId))
      : newHLC(nodeId);
    await db.todos.update(plan.goalTodoId, { activePlanId: newActive.id, updatedAt: goalMergedUpdatedAt });
    onLocalChange('todos', 'update', plan.goalTodoId).catch(() => {});
  }
}

export async function addNodeToPlan(planId: string, todoId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (!plan) return;
  if (plan.nodeIds.includes(todoId)) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.plans.update(planId, {
    nodeIds: [...plan.nodeIds, todoId],
    updatedAt: mergedUpdatedAt,
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function removeNodeFromPlan(planId: string, todoId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (!plan) return;
  if (todoId === plan.goalTodoId) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const newNodeIds = plan.nodeIds.filter((tid) => tid !== todoId);
  const edges = await db.actionEdges.bulkGet(plan.edgeIds);
  const newEdgeIds = plan.edgeIds.filter((_, i) => {
    const edge = edges[i];
    return edge?.fromTodoId !== todoId && edge?.toTodoId !== todoId;
  });
  await db.plans.update(planId, {
    nodeIds: newNodeIds,
    edgeIds: newEdgeIds,
    updatedAt: mergedUpdatedAt,
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function addEdgeToPlan(planId: string, edgeId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (!plan) return;
  if (plan.edgeIds.includes(edgeId)) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.plans.update(planId, {
    edgeIds: [...plan.edgeIds, edgeId],
    updatedAt: mergedUpdatedAt,
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function removeEdgeFromPlan(planId: string, edgeId: string): Promise<void> {
  const plan = await db.plans.get(planId);
  if (!plan) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const newEdgeIds = plan.edgeIds.filter((eid) => eid !== edgeId);
  await db.plans.update(planId, {
    edgeIds: newEdgeIds,
    updatedAt: mergedUpdatedAt,
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function setPlanEdges(planId: string, edgeIds: string[]): Promise<void> {
  const plan = await db.plans.get(planId);
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.plans.update(planId, {
    edgeIds: [...edgeIds],
    updatedAt: mergedUpdatedAt,
  });
  onLocalChange('plans', 'update', planId).catch(() => {});
}
