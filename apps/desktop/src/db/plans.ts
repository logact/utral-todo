import { db } from './drizzle-adapter';
import { plans as plansTable, todos, actionEdges } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Plan } from '../types';
import { planToRow, rowToPlan, rowToActionEdge } from './schema';

export async function getPlan(id: string): Promise<Plan | undefined> {
  const rows = await db.select().from(plansTable).where(eq(plansTable.id, id)) as any[];
  const row = rows[0];
  return row ? rowToPlan(row) : undefined;
}

export async function getPlansForGoal(goalTodoId: string): Promise<Plan[]> {
  const rows = await db.select().from(plansTable).where(
    eq(plansTable.goalTodoId, goalTodoId)
  ) as any[];
  return rows.map(rowToPlan);
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
  await db.insert(plansTable).values(planToRow(plan) as any);
  onLocalChange('plans', 'create', plan.id).catch(() => {});
  return plan;
}

export async function updatePlan(
  id: string,
  updates: Partial<Omit<Plan, 'id' | 'createdAt'>>
): Promise<void> {
  const plan = await getPlan(id);
  if (plan?.isSystemPlan) {
    throw new Error('Cannot modify a system plan');
  }
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(plansTable).set({
    ...planToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<Plan>),
  } as any).where(eq(plansTable.id, id));
  onLocalChange('plans', 'update', id).catch(() => {});
}

export async function deletePlan(id: string): Promise<void> {
  const plan = await getPlan(id);
  if (!plan) return;
  if (plan.isSystemPlan) {
    throw new Error('Cannot delete a system plan');
  }

  const goalRows = await db.select().from(todos).where(
    eq(todos.id, plan.goalTodoId)
  ) as any[];
  const goal = goalRows[0];
  const isActive = (goal as any)?.active_plan_id === id;

  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, hlc)
    : hlc;
  await db.update(plansTable).set({
    deleted_at_wall: hlc.wall,
    deleted_at_counter: hlc.counter,
    deleted_at_node: hlc.node,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(plansTable.id, id));
  onLocalChange('plans', 'delete', id).catch(() => {});

  if (isActive) {
    const remaining = await getPlansForGoal(plan.goalTodoId);
    let newActive: Plan;
    if (remaining.length > 0) {
      newActive = remaining[0];
    } else {
      newActive = await createPlan(plan.goalTodoId, 'Default Plan');
    }
    const goalMergedUpdatedAt = goal?.updated_at_wall != null
      ? mergeHLC({ wall: goal.updated_at_wall, counter: goal.updated_at_counter, node: goal.updated_at_node }, newHLC(nodeId))
      : newHLC(nodeId);
    await db.update(todos).set({
      active_plan_id: newActive.id,
      updated_at_wall: goalMergedUpdatedAt.wall,
      updated_at_counter: goalMergedUpdatedAt.counter,
      updated_at_node: goalMergedUpdatedAt.node,
    } as any).where(eq(todos.id, plan.goalTodoId));
    onLocalChange('todos', 'update', plan.goalTodoId).catch(() => {});
  }
}

export async function addNodeToPlan(planId: string, todoId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;
  if (plan.nodeIds.includes(todoId)) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(plansTable).set({
    node_ids: JSON.stringify([...plan.nodeIds, todoId]),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(plansTable.id, planId));
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function removeNodeFromPlan(planId: string, todoId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;
  if (todoId === plan.goalTodoId) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const newNodeIds = plan.nodeIds.filter((tid) => tid !== todoId);
  const edgeRows = await db.select().from(actionEdges).where(
    eq(actionEdges.id, plan.edgeIds[0] ?? '')
  ) as any[];
  const edges = edgeRows.map(rowToActionEdge);
  const newEdgeIds = plan.edgeIds.filter((_, i) => {
    const edge = edges[i];
    return edge?.fromTodoId !== todoId && edge?.toTodoId !== todoId;
  });
  await db.update(plansTable).set({
    node_ids: JSON.stringify(newNodeIds),
    edge_ids: JSON.stringify(newEdgeIds),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(plansTable.id, planId));
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function addEdgeToPlan(planId: string, edgeId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;
  if (plan.edgeIds.includes(edgeId)) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(plansTable).set({
    edge_ids: JSON.stringify([...plan.edgeIds, edgeId]),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(plansTable.id, planId));
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function removeEdgeFromPlan(planId: string, edgeId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) return;
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const newEdgeIds = plan.edgeIds.filter((eid) => eid !== edgeId);
  await db.update(plansTable).set({
    edge_ids: JSON.stringify(newEdgeIds),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(plansTable.id, planId));
  onLocalChange('plans', 'update', planId).catch(() => {});
}

export async function setPlanEdges(planId: string, edgeIds: string[]): Promise<void> {
  const plan = await getPlan(planId);
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(plansTable).set({
    edge_ids: JSON.stringify([...edgeIds]),
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(plansTable.id, planId));
  onLocalChange('plans', 'update', planId).catch(() => {});
}
