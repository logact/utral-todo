import { db } from './drizzle-adapter';
import { plans as plansTable, todos, actionEdges } from './schema';
import { eq } from 'drizzle-orm';
import { notifyDbOperation, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { newHLC, mergeHLC } from '../types';
import { TABLE_NAME_MAP } from '@utral/sync-share';
import type { Plan } from '../types';
import { planToRow, rowToPlan, rowToActionEdge, rowToTodo } from './schema';

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
    isDeleted: false,
  };
  await db.insert(plansTable).values(planToRow(plan));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'create', plan.id).catch(() => {});
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
  }).where(eq(plansTable.id, id));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'update', id).catch(() => {});
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
  const goal = goalRows[0] ? rowToTodo(goalRows[0]) : undefined;
  const isActive = goal?.activePlanId === id;

  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, hlc)
    : hlc;
  await db.update(plansTable).set({
    isDeleted: true,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(plansTable.id, id));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'delete', id).catch(() => {});

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
    await db.update(todos).set({
      activePlanId: newActive.id,
      updatedAtWall: goalMergedUpdatedAt.wall,
      updatedAtCounter: goalMergedUpdatedAt.counter,
      updatedAtNode: goalMergedUpdatedAt.node,
    }).where(eq(todos.id, plan.goalTodoId));
    notifyDbOperation(TABLE_NAME_MAP.todos, 'update', plan.goalTodoId).catch(() => {});
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
    nodeIds: [...plan.nodeIds, todoId],
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(plansTable.id, planId));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'update', planId).catch(() => {});
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
    nodeIds: newNodeIds,
    edgeIds: newEdgeIds,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(plansTable.id, planId));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'update', planId).catch(() => {});
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
    edgeIds: [...plan.edgeIds, edgeId],
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(plansTable.id, planId));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'update', planId).catch(() => {});
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
    edgeIds: newEdgeIds,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(plansTable.id, planId));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'update', planId).catch(() => {});
}

export async function setPlanEdges(planId: string, edgeIds: string[]): Promise<void> {
  const plan = await getPlan(planId);
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(plansTable).set({
    edgeIds: [...edgeIds],
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(plansTable.id, planId));
  notifyDbOperation(TABLE_NAME_MAP.plans, 'update', planId).catch(() => {});
}
