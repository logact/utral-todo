import { db } from './database';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Todo, TodoRelation, TodoRelationType } from '../types';

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
  };
  await db.relations.add(relation);
  onLocalChange('relations', 'create', relation.id).catch(() => {});
  return relation;
}

export async function getAllRelations(): Promise<TodoRelation[]> {
  return db.relations.toArray();
}

export async function getRelationsByFromTodo(fromTodoId: string): Promise<TodoRelation[]> {
  return db.relations.where('fromTodoId').equals(fromTodoId).toArray();
}

export async function getRelationsByToTodo(toTodoId: string): Promise<TodoRelation[]> {
  return db.relations.where('toTodoId').equals(toTodoId).toArray();
}

export async function getRelationsForTodo(todoId: string): Promise<{
  outgoing: TodoRelation[];
  incoming: TodoRelation[];
}> {
  const all = await db.relations.toArray();
  return {
    outgoing: all.filter((r) => r.fromTodoId === todoId),
    incoming: all.filter((r) => r.toTodoId === todoId),
  };
}

export async function getRoadToGoalRelations(): Promise<TodoRelation[]> {
  const all = await db.relations.toArray();
  return all.filter((r) =>
    ['parent_of', 'source_from', 'achieves', 'ordered_before'].includes(r.type)
  );
}

export async function getRoadRelationsForTodo(todoId: string): Promise<TodoRelation[]> {
  const all = await db.relations.toArray();
  return all.filter(
    (r) =>
      ['parent_of', 'source_from', 'achieves', 'ordered_before'].includes(r.type) &&
      (r.fromTodoId === todoId || r.toTodoId === todoId)
  );
}

export async function getChildGoals(goalId: string): Promise<Todo[]> {
  const relations = await db.relations
    .where('fromTodoId')
    .equals(goalId)
    .and((r) => r.type === 'parent_of' || r.type === 'source_from')
    .toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.toTodoId);
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getParentGoal(goalId: string): Promise<Todo | undefined> {
  const relations = await db.relations
    .where('toTodoId')
    .equals(goalId)
    .and((r) => r.type === 'parent_of' || r.type === 'source_from')
    .toArray();
  if (relations.length === 0) return undefined;
  return db.todos.get(relations[0].fromTodoId);
}

export async function getPreAchieveGoals(goalId: string): Promise<Todo[]> {
  const relations = await db.relations
    .where('toTodoId')
    .equals(goalId)
    .and((r) => r.type === 'ordered_before')
    .toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.fromTodoId);
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getTasksForGoal(goalId: string): Promise<Todo[]> {
  const relations = await db.relations
    .where('toTodoId')
    .equals(goalId)
    .and((r) => r.type === 'achieves')
    .toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.fromTodoId);
    if (todo && todo.nodeType === 'task') result.push(todo);
  }
  return result;
}

export async function getGoalsForTask(taskId: string): Promise<Todo[]> {
  const relations = await db.relations
    .where('fromTodoId')
    .equals(taskId)
    .and((r) => r.type === 'achieves')
    .toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.toTodoId);
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getOrderedSuccessors(todoId: string): Promise<Todo[]> {
  const relations = await db.relations
    .where('fromTodoId')
    .equals(todoId)
    .and((r) => r.type === 'ordered_before')
    .toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.toTodoId);
    if (todo) result.push(todo);
  }
  return result;
}

export async function getOrderedPredecessors(todoId: string): Promise<Todo[]> {
  const relations = await db.relations
    .where('toTodoId')
    .equals(todoId)
    .and((r) => r.type === 'ordered_before')
    .toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.fromTodoId);
    if (todo) result.push(todo);
  }
  return result;
}

export async function updateRelation(
  id: string,
  updates: Partial<Pick<TodoRelation, 'type'>>
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await db.relations.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.relations.update(id, { ...updates, updatedAt: mergedUpdatedAt });
  onLocalChange('relations', 'update', id).catch(() => {});
}

export async function deleteRelation(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await db.relations.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.relations.update(id, { deletedAt: hlc, updatedAt: mergedUpdatedAt });
  onLocalChange('relations', 'delete', id).catch(() => {});
}

export async function deleteRelationsInvolvingTodo(todoId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const all = await db.relations.toArray();
  const toDelete = all.filter((r) => r.fromTodoId === todoId || r.toTodoId === todoId);
  for (const rel of toDelete) {
    const mergedUpdatedAt = rel.updatedAt
      ? mergeHLC(rel.updatedAt, hlc)
      : hlc;
    await db.relations.update(rel.id, { deletedAt: hlc, updatedAt: mergedUpdatedAt }).catch(() => {});
  }
}

// Walks backward through parent_of / source_for goals, then through achieves task->goal.
export async function traceSourceChain(todoId: string): Promise<Todo[]> {
  const chain: Todo[] = [];
  const visited = new Set<string>();
  let currentId = todoId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = await db.todos.get(currentId);
    if (!todo) break;
    chain.unshift(todo);

    if (todo.nodeType === 'goal') {
      const relations = await db.relations
        .where('toTodoId')
        .equals(currentId)
        .and((r) => r.type === 'source_from' || r.type === 'parent_of')
        .toArray();
      if (relations.length === 0) break;
      currentId = relations[0].fromTodoId;
    } else {
      const relations = await db.relations
        .where('toTodoId')
        .equals(currentId)
        .and((r) => r.type === 'achieves')
        .toArray();
      if (relations.length === 0) break;
      currentId = relations[0].fromTodoId;
    }
  }

  return chain;
}

export async function getSpawnedTodos(todoId: string): Promise<Todo[]> {
  const relations = await db.relations.where('fromTodoId').equals(todoId).and((r) => r.type === 'source_from').toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.toTodoId);
    if (todo) result.push(todo);
  }
  return result;
}

export async function getAssignedInstances(templateId: string): Promise<Todo[]> {
  const relations = await db.relations.where('fromTodoId').equals(templateId).and((r) => r.type === 'assign_from').toArray();
  const result: Todo[] = [];
  for (const rel of relations) {
    const todo = await db.todos.get(rel.toTodoId);
    if (todo) result.push(todo);
  }
  return result;
}

export async function getTemplateForInstance(instanceId: string): Promise<Todo | undefined> {
  const relations = await db.relations.where('toTodoId').equals(instanceId).and((r) => r.type === 'assign_from').toArray();
  if (relations.length === 0) return undefined;
  return db.todos.get(relations[0].fromTodoId);
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
    await db.todos.update(inst.id, { deletedAt: hlc, updatedAt: mergedUpdatedAt }).catch(() => {});
  }
}
