import { db } from './drizzle-adapter';
import { actionEdges } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { ActionEdge, ActionEdgeType } from '../types';
import { actionEdgeToRow, rowToActionEdge } from './schema';

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
  await db.insert(actionEdges).values(actionEdgeToRow(edge) as any);
  onLocalChange('actionEdges', 'create', edge.id).catch(() => {});
  return edge;
}

export async function getAllActionEdges(): Promise<ActionEdge[]> {
  const rows = await db.select().from(actionEdges) as any[];
  return rows.map(rowToActionEdge);
}

export async function getActionEdgesForTodo(todoId: string): Promise<{
  outgoing: ActionEdge[];
  incoming: ActionEdge[];
}> {
  const all = await getAllActionEdges();
  return {
    outgoing: all.filter((e) => e.fromTodoId === todoId),
    incoming: all.filter((e) => e.toTodoId === todoId),
  };
}

export async function getAllActionEdgesForTodo(todoId: string): Promise<ActionEdge[]> {
  const all = await getAllActionEdges();

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
  const rows = await db.select().from(actionEdges).where(eq(actionEdges.id, id)) as any[];
  const existing = rows[0] ? rowToActionEdge(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(actionEdges).set({
    ...actionEdgeToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<ActionEdge>),
  } as any).where(eq(actionEdges.id, id));
  onLocalChange('actionEdges', 'update', id).catch(() => {});
}

export async function deleteActionEdge(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const rows = await db.select().from(actionEdges).where(eq(actionEdges.id, id)) as any[];
  const existing = rows[0] ? rowToActionEdge(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.update(actionEdges).set({
    is_deleted: true,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(actionEdges.id, id));
  onLocalChange('actionEdges', 'delete', id).catch(() => {});
}

export async function deleteActionEdgesForTodo(todoId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const all = await getAllActionEdges();
  const toDelete = all.filter((e) => e.fromTodoId === todoId || e.toTodoId === todoId);
  for (const edge of toDelete) {
    const mergedUpdatedAt = edge.updatedAt
      ? mergeHLC(edge.updatedAt, hlc)
      : hlc;
    await db.update(actionEdges).set({
      is_deleted: true,
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    } as any).where(eq(actionEdges.id, edge.id)).catch(() => {});
  }
}
