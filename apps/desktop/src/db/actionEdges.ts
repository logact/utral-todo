import { db } from './database';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { ActionEdge, ActionEdgeType } from '../types';

export async function createActionEdge(
  fromTodoId: string,
  toTodoId: string,
  type: ActionEdgeType
): Promise<ActionEdge> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const edge: ActionEdge = {
    id: crypto.randomUUID(),
    fromTodoId,
    toTodoId,
    type,
    createdAt: hlc,
    updatedAt: hlc,
  };
  await db.actionEdges.add(edge);
  onLocalChange('actionEdges', 'create', edge.id).catch(() => {});
  return edge;
}

export async function getAllActionEdges(): Promise<ActionEdge[]> {
  return db.actionEdges.toArray();
}

export async function getActionEdgesForTodo(todoId: string): Promise<{
  outgoing: ActionEdge[];
  incoming: ActionEdge[];
}> {
  const all = await db.actionEdges.toArray();
  return {
    outgoing: all.filter((e) => e.fromTodoId === todoId),
    incoming: all.filter((e) => e.toTodoId === todoId),
  };
}

export async function getAllActionEdgesForTodo(todoId: string): Promise<ActionEdge[]> {
  const all = await db.actionEdges.toArray();

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
  id: string,
  updates: Partial<Pick<ActionEdge, 'type'>>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await db.actionEdges.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.actionEdges.update(id, { ...updates, updatedAt: mergedUpdatedAt });
  onLocalChange('actionEdges', 'update', id).catch(() => {});
}

export async function deleteActionEdge(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await db.actionEdges.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.actionEdges.update(id, { deletedAt: hlc, updatedAt: mergedUpdatedAt });
  onLocalChange('actionEdges', 'delete', id).catch(() => {});
}

export async function deleteActionEdgesForTodo(todoId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const all = await db.actionEdges.toArray();
  const toDelete = all.filter((e) => e.fromTodoId === todoId || e.toTodoId === todoId);
  for (const edge of toDelete) {
    const mergedUpdatedAt = edge.updatedAt
      ? mergeHLC(edge.updatedAt, hlc)
      : hlc;
    await db.actionEdges.update(edge.id, { deletedAt: hlc, updatedAt: mergedUpdatedAt }).catch(() => {});
  }
}
