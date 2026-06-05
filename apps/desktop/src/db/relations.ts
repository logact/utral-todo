import { db } from './database';
import type { Todo, TodoRelation, TodoRelationType } from '../types';

export async function createRelation(
  fromTodoId: string,
  toTodoId: string,
  type: TodoRelationType
): Promise<TodoRelation> {
  const relation: TodoRelation = {
    id: crypto.randomUUID(),
    fromTodoId,
    toTodoId,
    type,
    createdAt: new Date(),
  };
  await db.relations.add(relation);
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

export async function deleteRelation(id: string): Promise<void> {
  await db.relations.delete(id);
}

export async function deleteRelationsInvolvingTodo(todoId: string): Promise<void> {
  const all = await db.relations.toArray();
  const toDelete = all.filter((r) => r.fromTodoId === todoId || r.toTodoId === todoId);
  for (const rel of toDelete) {
    await db.relations.delete(rel.id).catch(() => {});
  }
}

export async function traceSourceChain(todoId: string): Promise<Todo[]> {
  const chain: Todo[] = [];
  const visited = new Set<string>();
  let currentId = todoId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = await db.todos.get(currentId);
    if (!todo) break;

    const relations = await db.relations.where('toTodoId').equals(currentId).and((r) => r.type === 'source_from').toArray();
    if (relations.length === 0) {
      chain.unshift(todo);
      break;
    }
    chain.unshift(todo);
    currentId = relations[0].fromTodoId;
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
  for (const inst of instances) {
    await deleteRelationsInvolvingTodo(inst.id);
    await db.todos.delete(inst.id).catch(() => {});
  }
}
