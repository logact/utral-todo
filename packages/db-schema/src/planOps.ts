import { eq } from 'drizzle-orm';
import {
  plans as plansTable,
  todos,
  actionEdges,
} from './schema.js';
import {
  planToRow,
  rowToPlan,
  rowToTodo,
  rowToActionEdge,
} from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import type { Plan } from '@utral/types';
import { getGenerateId, type DbStore } from './store.js';

export async function getPlan(store: DbStore, id: string): Promise<Plan | undefined> {
  const rows = (await store.db.select().from(plansTable).where(eq(plansTable.id, id))) as any[];
  const row = rows[0];
  return row ? rowToPlan(row) : undefined;
}

export async function getPlansForGoal(store: DbStore, goalTodoId: string): Promise<Plan[]> {
  const rows = (await store.db
    .select()
    .from(plansTable)
    .where(eq(plansTable.goalTodoId, goalTodoId))) as any[];
  return rows.map(rowToPlan);
}

export async function createPlan(
  store: DbStore,
  goalTodoId: string,
  title: string,
  nodeIds: string[] = []
): Promise<Plan> {
  const nodeId = store.deviceId;
  const generateId = getGenerateId(store);
  const hlc = newHLC(nodeId);
  const plan: Plan = {
    id: generateId(),
    goalTodoId,
    title: title.trim() || 'Untitled Plan',
    nodeIds,
    edgeIds: [],
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };
  await store.db.insert(plansTable).values(planToRow(plan));
  await store.notifyDbOperation('plans', 'create', plan.id);
  return plan;
}

export async function updatePlan(
  store: DbStore,
  id: string,
  updates: Partial<Omit<Plan, 'id' | 'createdAt'>>
): Promise<void> {
  const plan = await getPlan(store, id);
  if (plan?.isSystemPlan) {
    throw new Error('Cannot modify a system plan');
  }
  const nodeId = store.deviceId;
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(plansTable)
    .set({
      ...planToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<Plan>),
    })
    .where(eq(plansTable.id, id));
  await store.notifyDbOperation('plans', 'update', id);
}

export async function deletePlan(store: DbStore, id: string): Promise<void> {
  const plan = await getPlan(store, id);
  if (!plan) return;
  if (plan.isSystemPlan) {
    throw new Error('Cannot delete a system plan');
  }

  const goalRows = (await store.db
    .select()
    .from(todos)
    .where(eq(todos.id, plan.goalTodoId))) as any[];
  const goal = goalRows[0] ? rowToTodo(goalRows[0]) : undefined;
  const isActive = goal?.activePlanId === id;

  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const mergedUpdatedAt = plan.updatedAt ? mergeHLC(plan.updatedAt, hlc) : hlc;
  await store.db
    .update(plansTable)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(plansTable.id, id));
  await store.notifyDbOperation('plans', 'delete', id);

  if (isActive) {
    const remaining = await getPlansForGoal(store, plan.goalTodoId);
    let newActive: Plan;
    if (remaining.length > 0) {
      newActive = remaining[0];
    } else {
      newActive = await createPlan(store, plan.goalTodoId, 'Default Plan');
    }
    const goalMergedUpdatedAt = goal?.updatedAt
      ? mergeHLC(goal.updatedAt, newHLC(nodeId))
      : newHLC(nodeId);
    await store.db
      .update(todos)
      .set({
        activePlanId: newActive.id,
        updatedAtWall: goalMergedUpdatedAt.wall,
        updatedAtCounter: goalMergedUpdatedAt.counter,
        updatedAtNode: goalMergedUpdatedAt.node,
      })
      .where(eq(todos.id, plan.goalTodoId));
    await store.notifyDbOperation('todos', 'update', plan.goalTodoId);
  }
}

export async function addNodeToPlan(
  store: DbStore,
  planId: string,
  todoId: string
): Promise<void> {
  const plan = await getPlan(store, planId);
  if (!plan) return;
  if (plan.nodeIds.includes(todoId)) return;
  const nodeId = store.deviceId;
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(plansTable)
    .set({
      nodeIds: [...plan.nodeIds, todoId],
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(plansTable.id, planId));
  await store.notifyDbOperation('plans', 'update', planId);
}

export async function removeNodeFromPlan(
  store: DbStore,
  planId: string,
  todoId: string
): Promise<void> {
  const plan = await getPlan(store, planId);
  if (!plan) return;
  if (todoId === plan.goalTodoId) return;
  const nodeId = store.deviceId;
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const newNodeIds = plan.nodeIds.filter((tid) => tid !== todoId);
  const edgeRows = (await store.db
    .select()
    .from(actionEdges)
    .where(eq(actionEdges.id, plan.edgeIds[0] ?? ''))) as any[];
  const edges = edgeRows.map(rowToActionEdge);
  const newEdgeIds = plan.edgeIds.filter((_, i) => {
    const edge = edges[i];
    return edge?.fromTodoId !== todoId && edge?.toTodoId !== todoId;
  });
  await store.db
    .update(plansTable)
    .set({
      nodeIds: newNodeIds,
      edgeIds: newEdgeIds,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(plansTable.id, planId));
  await store.notifyDbOperation('plans', 'update', planId);
}

export async function addEdgeToPlan(
  store: DbStore,
  planId: string,
  edgeId: string
): Promise<void> {
  const plan = await getPlan(store, planId);
  if (!plan) return;
  if (plan.edgeIds.includes(edgeId)) return;
  const nodeId = store.deviceId;
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(plansTable)
    .set({
      edgeIds: [...plan.edgeIds, edgeId],
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(plansTable.id, planId));
  await store.notifyDbOperation('plans', 'update', planId);
}

export async function removeEdgeFromPlan(
  store: DbStore,
  planId: string,
  edgeId: string
): Promise<void> {
  const plan = await getPlan(store, planId);
  if (!plan) return;
  const nodeId = store.deviceId;
  const mergedUpdatedAt = plan.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  const newEdgeIds = plan.edgeIds.filter((eid) => eid !== edgeId);
  await store.db
    .update(plansTable)
    .set({
      edgeIds: newEdgeIds,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(plansTable.id, planId));
  await store.notifyDbOperation('plans', 'update', planId);
}

export async function setPlanEdges(
  store: DbStore,
  planId: string,
  edgeIds: string[]
): Promise<void> {
  const plan = await getPlan(store, planId);
  const nodeId = store.deviceId;
  const mergedUpdatedAt = plan?.updatedAt
    ? mergeHLC(plan.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(plansTable)
    .set({
      edgeIds: [...edgeIds],
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(plansTable.id, planId));
  await store.notifyDbOperation('plans', 'update', planId);
}
