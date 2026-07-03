import { eq } from 'drizzle-orm';
import { actionEdges } from './schema.js';
import { actionEdgeToRow, rowToActionEdge } from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import type { ActionEdge, ActionEdgeType } from '@utral/types';
import { getGenerateId, type DbStore } from './store.js';

export async function createActionEdge(
  store: DbStore,
  fromTodoId: string,
  toTodoId: string,
  type: ActionEdgeType
): Promise<ActionEdge> {
  const generateId = getGenerateId(store);
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const edge: ActionEdge = {
    id: generateId(),
    fromTodoId,
    toTodoId,
    type,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };
  await store.db.insert(actionEdges).values(actionEdgeToRow(edge));
  await store.notifyDbOperation('actionEdges', 'create', edge.id);
  return edge;
}

export async function getAllActionEdges(store: DbStore): Promise<ActionEdge[]> {
  const rows = (await store.db.select().from(actionEdges)) as any[];
  return rows.map(rowToActionEdge);
}

export async function getActionEdgesForTodo(
  store: DbStore,
  todoId: string
): Promise<{ outgoing: ActionEdge[]; incoming: ActionEdge[] }> {
  const all = await getAllActionEdges(store);
  return {
    outgoing: all.filter((e) => e.fromTodoId === todoId),
    incoming: all.filter((e) => e.toTodoId === todoId),
  };
}

export async function getAllActionEdgesForTodo(
  store: DbStore,
  todoId: string
): Promise<ActionEdge[]> {
  const all = await getAllActionEdges(store);

  const connected = new Set<string>([todoId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of all) {
      if (connected.has(edge.fromTodoId) && !connected.has(edge.toTodoId)) {
        connected.add(edge.toTodoId);
        changed = true;
      }
      if (connected.has(edge.toTodoId) && !connected.has(edge.fromTodoId)) {
        connected.add(edge.fromTodoId);
        changed = true;
      }
    }
  }
  return all.filter((e) => connected.has(e.fromTodoId) && connected.has(e.toTodoId));
}

export async function updateActionEdge(
  store: DbStore,
  id: string,
  updates: Partial<Pick<ActionEdge, 'type'>>
): Promise<void> {
  const nodeId = store.deviceId;
  const rows = (await store.db.select().from(actionEdges).where(eq(actionEdges.id, id))) as any[];
  const existing = rows[0] ? rowToActionEdge(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(actionEdges)
    .set({
      ...actionEdgeToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<ActionEdge>),
    })
    .where(eq(actionEdges.id, id));
  await store.notifyDbOperation('actionEdges', 'update', id);
}

export async function deleteActionEdge(store: DbStore, id: string): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const rows = (await store.db.select().from(actionEdges).where(eq(actionEdges.id, id))) as any[];
  const existing = rows[0] ? rowToActionEdge(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await store.db
    .update(actionEdges)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(actionEdges.id, id));
  await store.notifyDbOperation('actionEdges', 'delete', id);
}

export async function deleteActionEdgesForTodo(
  store: DbStore,
  todoId: string
): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const all = await getAllActionEdges(store);
  const toDelete = all.filter((e) => e.fromTodoId === todoId || e.toTodoId === todoId);
  for (const edge of toDelete) {
    const mergedUpdatedAt = edge.updatedAt
      ? mergeHLC(edge.updatedAt, hlc)
      : hlc;
    await store.db
      .update(actionEdges)
      .set({
        isDeleted: true,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(actionEdges.id, edge.id))
      .catch(() => {});
    await store.notifyDbOperation('actionEdges', 'delete', edge.id);
  }
}
