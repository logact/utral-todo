import { db } from './drizzle-adapter';
import { todoRelations, todos } from './schema';
import { eq, and } from 'drizzle-orm';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Todo, TodoRelation, TodoRelationType } from '../types';
import { rowToTodo, rowToRelation, relationToRow } from './schema';

export async function createRelation(
  fromTodoId: string,
  toTodoId: string,
  type: TodoRelationType
): Promise<TodoRelation> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const relation: TodoRelation = {
    id: crypto.randomUUID(),
    fromTodoId,
    toTodoId,
    type,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };
  await db.insert(todoRelations).values(relationToRow(relation));
  syncLocalChange('relations', 'create', relation.id).catch(() => {});
  return relation;
}

export async function getAllRelations(): Promise<TodoRelation[]> {
  const rows = await db.select().from(todoRelations) as any[];
  return rows.map(rowToRelation);
}

export async function getRelationsByFromTodo(fromTodoId: string): Promise<TodoRelation[]> {
  const rows = await db.select().from(todoRelations).where(
    eq(todoRelations.fromTodoId, fromTodoId)
  ) as any[];
  return rows.map(rowToRelation);
}

export async function getRelationsByToTodo(toTodoId: string): Promise<TodoRelation[]> {
  const rows = await db.select().from(todoRelations).where(
    eq(todoRelations.toTodoId, toTodoId)
  ) as any[];
  return rows.map(rowToRelation);
}

export async function getRelationsForTodo(todoId: string): Promise<{
  outgoing: TodoRelation[];
  incoming: TodoRelation[];
}> {
  const all = await getAllRelations();
  return {
    outgoing: all.filter((r) => r.fromTodoId === todoId),
    incoming: all.filter((r) => r.toTodoId === todoId),
  };
}

export async function getRoadToGoalRelations(): Promise<TodoRelation[]> {
  const all = await getAllRelations();
  return all.filter((r) =>
    ['parent_of', 'source_from', 'achieves', 'ordered_before'].includes(r.type)
  );
}

export async function getRoadRelationsForTodo(todoId: string): Promise<TodoRelation[]> {
  const all = await getAllRelations();
  return all.filter(
    (r) =>
      ['parent_of', 'source_from', 'achieves', 'ordered_before'].includes(r.type) &&
      (r.fromTodoId === todoId || r.toTodoId === todoId)
  );
}

export async function getChildGoals(goalId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.fromTodoId, goalId),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation).filter(
    (r) => r.type === 'parent_of' || r.type === 'source_from'
  );
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.toTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getParentGoal(goalId: string): Promise<Todo | undefined> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.toTodoId, goalId),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation).filter(
    (r) => r.type === 'parent_of' || r.type === 'source_from'
  );
  if (relations.length === 0) return undefined;
  const todoRows = await db.select().from(todos).where(
    eq(todos.id, relations[0].fromTodoId)
  ) as any[];
  return todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
}

export async function getPreAchieveGoals(goalId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.toTodoId, goalId),
      eq(todoRelations.type, 'ordered_before'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.fromTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getTasksForGoal(goalId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.toTodoId, goalId),
      eq(todoRelations.type, 'achieves'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.fromTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'task') result.push(todo);
  }
  return result;
}

export async function getGoalsForTask(taskId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.fromTodoId, taskId),
      eq(todoRelations.type, 'achieves'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.toTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getOrderedSuccessors(todoId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.fromTodoId, todoId),
      eq(todoRelations.type, 'ordered_before'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.toTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function getOrderedPredecessors(todoId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.toTodoId, todoId),
      eq(todoRelations.type, 'ordered_before'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.fromTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function updateRelation(
  id: string,
  updates: Partial<Pick<TodoRelation, 'type'>>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const rows = await db.select().from(todoRelations).where(eq(todoRelations.id, id)) as any[];
  const existing = rows[0] ? rowToRelation(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(todoRelations).set({
    ...relationToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<TodoRelation>),
  }).where(eq(todoRelations.id, id));
  syncLocalChange('relations', 'update', id).catch(() => {});
}

export async function deleteRelation(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const rows = await db.select().from(todoRelations).where(eq(todoRelations.id, id)) as any[];
  const existing = rows[0] ? rowToRelation(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.update(todoRelations).set({
    isDeleted: true,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(todoRelations.id, id));
  syncLocalChange('relations', 'delete', id).catch(() => {});
}

export async function deleteRelationsInvolvingTodo(todoId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const rows = await db.select().from(todoRelations) as any[];
  const all = rows.map(rowToRelation);
  const toDelete = all.filter((r) => r.fromTodoId === todoId || r.toTodoId === todoId);
  for (const rel of toDelete) {
    const mergedUpdatedAt = rel.updatedAt
      ? mergeHLC(rel.updatedAt, hlc)
      : hlc;
    await db.update(todoRelations).set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    }).where(eq(todoRelations.id, rel.id)).catch(() => {});
  }
}

// Walks backward through parent_of / source_for goals, then through achieves task->goal.
export async function traceSourceChain(todoId: string): Promise<Todo[]> {
  const chain: Todo[] = [];
  const visited = new Set<string>();
  let currentId = todoId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todoRows = await db.select().from(todos).where(eq(todos.id, currentId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (!todo) break;
    chain.unshift(todo);

    if (todo.nodeType === 'goal') {
      const relRows = await db.select().from(todoRelations).where(
        and(
          eq(todoRelations.toTodoId, currentId),
          eq(todoRelations.isDeleted, false)
        )
      ) as any[];
      const relations = relRows.map(rowToRelation).filter(
        (r) => r.type === 'source_from' || r.type === 'parent_of'
      );
      if (relations.length === 0) break;
      currentId = relations[0].fromTodoId;
    } else {
      const relRows = await db.select().from(todoRelations).where(
        and(
          eq(todoRelations.toTodoId, currentId),
          eq(todoRelations.type, 'achieves'),
          eq(todoRelations.isDeleted, false)
        )
      ) as any[];
      const relations = relRows.map(rowToRelation);
      if (relations.length === 0) break;
      currentId = relations[0].fromTodoId;
    }
  }

  return chain;
}

export async function getSpawnedTodos(todoId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.fromTodoId, todoId),
      eq(todoRelations.type, 'source_from'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.toTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function getAssignedInstances(templateId: string): Promise<Todo[]> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.fromTodoId, templateId),
      eq(todoRelations.type, 'assign_from'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(todos).where(eq(todos.id, rel.toTodoId)) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function getTemplateForInstance(instanceId: string): Promise<Todo | undefined> {
  const rows = await db.select().from(todoRelations).where(
    and(
      eq(todoRelations.toTodoId, instanceId),
      eq(todoRelations.type, 'assign_from'),
      eq(todoRelations.isDeleted, false)
    )
  ) as any[];
  const relations = rows.map(rowToRelation);
  if (relations.length === 0) return undefined;
  const todoRows = await db.select().from(todos).where(
    eq(todos.id, relations[0].fromTodoId)
  ) as any[];
  return todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
}

export async function deleteAssignedInstances(templateId: string): Promise<void> {
  const instances = await getAssignedInstances(templateId);
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  for (const inst of instances) {
    await deleteRelationsInvolvingTodo(inst.id);
    const mergedUpdatedAt = inst.updatedAt
      ? mergeHLC(inst.updatedAt, hlc)
      : hlc;
    await db.update(todos).set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    }).where(eq(todos.id, inst.id)).catch(() => {});
  }
}
