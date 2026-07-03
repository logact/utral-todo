import { eq, and } from 'drizzle-orm';
import { todoRelations, todos } from './schema.js';
import { rowToTodo, rowToRelation, relationToRow } from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import type { Todo, TodoRelation, TodoRelationType } from '@utral/types';
import { getGenerateId, type DbStore } from './store.js';

export async function createRelation(
  store: DbStore,
  fromTodoId: string,
  toTodoId: string,
  type: TodoRelationType
): Promise<TodoRelation> {
  const generateId = getGenerateId(store);
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const relation: TodoRelation = {
    id: generateId(),
    fromTodoId,
    toTodoId,
    type,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };
  await store.db.insert(todoRelations).values(relationToRow(relation));
  await store.notifyDbOperation('todoRelations', 'create', relation.id);
  return relation;
}

export async function getAllRelations(store: DbStore): Promise<TodoRelation[]> {
  const rows = (await store.db.select().from(todoRelations)) as any[];
  return rows.map(rowToRelation);
}

export async function getRelationsByFromTodo(
  store: DbStore,
  fromTodoId: string
): Promise<TodoRelation[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(eq(todoRelations.fromTodoId, fromTodoId))) as any[];
  return rows.map(rowToRelation);
}

export async function getRelationsByToTodo(
  store: DbStore,
  toTodoId: string
): Promise<TodoRelation[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(eq(todoRelations.toTodoId, toTodoId))) as any[];
  return rows.map(rowToRelation);
}

export async function getRelationsForTodo(
  store: DbStore,
  todoId: string
): Promise<{ outgoing: TodoRelation[]; incoming: TodoRelation[] }> {
  const all = await getAllRelations(store);
  return {
    outgoing: all.filter((r) => r.fromTodoId === todoId),
    incoming: all.filter((r) => r.toTodoId === todoId),
  };
}

export async function getRoadToGoalRelations(store: DbStore): Promise<TodoRelation[]> {
  const all = await getAllRelations(store);
  return all.filter((r) =>
    ['parent_of', 'source_from', 'achieves', 'ordered_before'].includes(r.type)
  );
}

export async function getRoadRelationsForTodo(
  store: DbStore,
  todoId: string
): Promise<TodoRelation[]> {
  const all = await getAllRelations(store);
  return all.filter(
    (r) =>
      ['parent_of', 'source_from', 'achieves', 'ordered_before'].includes(r.type) &&
      (r.fromTodoId === todoId || r.toTodoId === todoId)
  );
}

export async function getChildGoals(store: DbStore, goalId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.fromTodoId, goalId),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation).filter(
    (r) => r.type === 'parent_of' || r.type === 'source_from'
  );
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.toTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getParentGoal(store: DbStore, goalId: string): Promise<Todo | undefined> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.toTodoId, goalId),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation).filter(
    (r) => r.type === 'parent_of' || r.type === 'source_from'
  );
  if (relations.length === 0) return undefined;
  const todoRows = (await store.db
    .select()
    .from(todos)
    .where(eq(todos.id, relations[0].fromTodoId))) as any[];
  return todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
}

export async function getPreAchieveGoals(store: DbStore, goalId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.toTodoId, goalId),
        eq(todoRelations.type, 'ordered_before'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.fromTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getTasksForGoal(store: DbStore, goalId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.toTodoId, goalId),
        eq(todoRelations.type, 'achieves'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.fromTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'task') result.push(todo);
  }
  return result;
}

export async function getGoalsForTask(store: DbStore, taskId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.fromTodoId, taskId),
        eq(todoRelations.type, 'achieves'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.toTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo && todo.nodeType === 'goal') result.push(todo);
  }
  return result;
}

export async function getOrderedSuccessors(store: DbStore, todoId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.fromTodoId, todoId),
        eq(todoRelations.type, 'ordered_before'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.toTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function getOrderedPredecessors(store: DbStore, todoId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.toTodoId, todoId),
        eq(todoRelations.type, 'ordered_before'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.fromTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function updateRelation(
  store: DbStore,
  id: string,
  updates: Partial<Pick<TodoRelation, 'type'>>
): Promise<void> {
  const nodeId = store.deviceId;
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(eq(todoRelations.id, id))) as any[];
  const existing = rows[0] ? rowToRelation(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await store.db
    .update(todoRelations)
    .set({
      ...relationToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<TodoRelation>),
    })
    .where(eq(todoRelations.id, id));
  await store.notifyDbOperation('todoRelations', 'update', id);
}

export async function deleteRelation(store: DbStore, id: string): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(eq(todoRelations.id, id))) as any[];
  const existing = rows[0] ? rowToRelation(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await store.db
    .update(todoRelations)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(todoRelations.id, id));
  await store.notifyDbOperation('todoRelations', 'delete', id);
}

export async function deleteRelationsInvolvingTodo(
  store: DbStore,
  todoId: string
): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const rows = (await store.db.select().from(todoRelations)) as any[];
  const all = rows.map(rowToRelation);
  const toDelete = all.filter((r) => r.fromTodoId === todoId || r.toTodoId === todoId);
  for (const rel of toDelete) {
    const mergedUpdatedAt = rel.updatedAt
      ? mergeHLC(rel.updatedAt, hlc)
      : hlc;
    await store.db
      .update(todoRelations)
      .set({
        isDeleted: true,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todoRelations.id, rel.id))
      .catch(() => {});
    await store.notifyDbOperation('todoRelations', 'delete', rel.id);
  }
}

// Walks backward through parent_of / source_for goals, then through achieves task->goal.
export async function traceSourceChain(store: DbStore, todoId: string): Promise<Todo[]> {
  const chain: Todo[] = [];
  const visited = new Set<string>();
  let currentId = todoId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, currentId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (!todo) break;
    chain.unshift(todo);

    if (todo.nodeType === 'goal') {
      const relRows = (await store.db
        .select()
        .from(todoRelations)
        .where(
          and(
            eq(todoRelations.toTodoId, currentId),
            eq(todoRelations.isDeleted, false)
          )
        )) as any[];
      const relations = relRows.map(rowToRelation).filter(
        (r) => r.type === 'source_from' || r.type === 'parent_of'
      );
      if (relations.length === 0) break;
      currentId = relations[0].fromTodoId;
    } else {
      const relRows = (await store.db
        .select()
        .from(todoRelations)
        .where(
          and(
            eq(todoRelations.toTodoId, currentId),
            eq(todoRelations.type, 'achieves'),
            eq(todoRelations.isDeleted, false)
          )
        )) as any[];
      const relations = relRows.map(rowToRelation);
      if (relations.length === 0) break;
      currentId = relations[0].fromTodoId;
    }
  }

  return chain;
}

export async function getSpawnedTodos(store: DbStore, todoId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.fromTodoId, todoId),
        eq(todoRelations.type, 'source_from'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.toTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function getAssignedInstances(store: DbStore, templateId: string): Promise<Todo[]> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.fromTodoId, templateId),
        eq(todoRelations.type, 'assign_from'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  const result: Todo[] = [];
  for (const rel of relations) {
    const todoRows = (await store.db
      .select()
      .from(todos)
      .where(eq(todos.id, rel.toTodoId))) as any[];
    const todo = todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
    if (todo) result.push(todo);
  }
  return result;
}

export async function getTemplateForInstance(
  store: DbStore,
  instanceId: string
): Promise<Todo | undefined> {
  const rows = (await store.db
    .select()
    .from(todoRelations)
    .where(
      and(
        eq(todoRelations.toTodoId, instanceId),
        eq(todoRelations.type, 'assign_from'),
        eq(todoRelations.isDeleted, false)
      )
    )) as any[];
  const relations = rows.map(rowToRelation);
  if (relations.length === 0) return undefined;
  const todoRows = (await store.db
    .select()
    .from(todos)
    .where(eq(todos.id, relations[0].fromTodoId))) as any[];
  return todoRows[0] ? rowToTodo(todoRows[0]) : undefined;
}

export async function deleteAssignedInstances(
  store: DbStore,
  templateId: string
): Promise<void> {
  const instances = await getAssignedInstances(store, templateId);
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  for (const inst of instances) {
    await deleteRelationsInvolvingTodo(store, inst.id);
    const mergedUpdatedAt = inst.updatedAt
      ? mergeHLC(inst.updatedAt, hlc)
      : hlc;
    await store.db
      .update(todos)
      .set({
        isDeleted: true,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todos.id, inst.id))
      .catch(() => {});
    await store.notifyDbOperation('todos', 'delete', inst.id);
  }
}
