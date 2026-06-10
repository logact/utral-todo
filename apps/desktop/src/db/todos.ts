import { db } from './database';
import { onLocalChange } from './syncEngine';
import { dateMatchesRule, computeVirtualTodo } from '../types';
import type { Todo, TodoStatus, Priority, RepeatRule } from '../types';

export async function createTodo(
  title: string,
  options?: {
    parentId?: string;
    projectId?: string;
    description?: string;
    priority?: Priority;
    estimatedMinutes?: number;
    dueDate?: Date;
    scheduledDate?: Date;
    scheduledEndDate?: Date;
    tags?: string[];
    repeatRule?: RepeatRule;
    order?: number;
    isGoal?: boolean;
    status?: TodoStatus;
  }
): Promise<Todo> {
  const now = new Date();
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    description: options?.description ?? '',
    status: options?.status ?? 'pending',
    priority: options?.priority ?? 'medium',
    estimatedMinutes: options?.estimatedMinutes ?? 60,
    tags: options?.tags ?? [],
    createdAt: now,
    updatedAt: now,
    projectId: options?.projectId,
    parentId: options?.parentId,
    dueDate: options?.dueDate,
    scheduledDate: options?.scheduledDate,
    scheduledEndDate: options?.scheduledEndDate,
    repeatRule: options?.repeatRule,
    order: options?.order ?? 0,
    isGoal: options?.isGoal,
  };
  await db.todos.add(todo);
  onLocalChange('todos', 'create', todo.id).catch(() => {});
  return todo;
}

export async function getAllTodos(): Promise<Todo[]> {
  return db.todos.toArray();
}

export async function getRootTodos(): Promise<Todo[]> {
  return db.todos.filter((t) => !t.parentId).toArray();
}

export async function getSubTodos(parentId: string): Promise<Todo[]> {
  const todos = await db.todos.where('parentId').equals(parentId).toArray();
  return todos.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function traceParentChain(todoId: string): Promise<Todo[]> {
  const chain: Todo[] = [];
  const visited = new Set<string>();
  let currentId = todoId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = await getTodo(currentId);
    if (!todo) break;
    chain.unshift(todo);

    if (todo.parentId) {
      currentId = todo.parentId;
      continue;
    }

    const relations = await db.relations.toArray();
    const sourceRel = relations.find(
      (r) => r.toTodoId === currentId && r.type === 'source_from'
    );
    if (sourceRel) {
      currentId = sourceRel.fromTodoId;
      continue;
    }

    break;
  }

  return chain;
}

export async function getTodoDescendants(todoId: string): Promise<Todo[]> {
  const descendants: Todo[] = [];

  async function collect(parentId: string) {
    const children = await getSubTodos(parentId);
    for (const child of children) {
      descendants.push(child);
      await collect(child.id);
    }
  }

  await collect(todoId);
  return descendants;
}

export async function reorderSubTodos(_parentId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.todos.update(orderedIds[i], { order: i, updatedAt: new Date() });
    onLocalChange('todos', 'update', orderedIds[i]).catch(() => {});
  }
}

export async function reorderTodos(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.todos.update(orderedIds[i], { order: i, updatedAt: new Date() });
    onLocalChange('todos', 'update', orderedIds[i]).catch(() => {});
  }
}

export async function getTodo(id: string): Promise<Todo | undefined> {
  return db.todos.get(id);
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<void> {
  await db.todos.update(id, { ...updates, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}

export async function bulkUpdateTodoProject(
  todoIds: string[],
  projectId: string | undefined
): Promise<void> {
  for (const id of todoIds) {
    await db.todos.update(id, { projectId, updatedAt: new Date() });
    onLocalChange('todos', 'update', id).catch(() => {});
  }
}

export async function deleteTodo(id: string): Promise<void> {
  await db.todos.delete(id);
  onLocalChange('todos', 'delete', id).catch(() => {});
}

export async function updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
  const updates: Partial<Todo> = { status, updatedAt: new Date() };
  if (status === 'in_progress') updates.startedAt = new Date();
  if (status === 'pending') updates.startedAt = undefined;
  if (status === 'done') updates.completedAt = new Date();
  await db.todos.update(id, updates);
  onLocalChange('todos', 'update', id).catch(() => {});
}

export async function updateTodoSchedule(
  id: string,
  scheduledDate: Date | undefined
): Promise<void> {
  await db.todos.update(id, { scheduledDate, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}

// ─── Virtual Instance Computation ───

export async function getVirtualTodosForDate(date: Date): Promise<Todo[]> {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const templates = await getRepeatTemplates();
  if (templates.length === 0) return [];

  // Get all occurrences for these templates on this date in one query
  const templateIds = templates.map((t) => t.id);
  const allOccurrences = await db.repeatOccurrences.toArray();
  const dateKey = d.toISOString().split('T')[0];
  const occurrencesByTemplate = new Map<string, typeof allOccurrences[0]>();
  for (const o of allOccurrences) {
    if (!templateIds.includes(o.templateId)) continue;
    const oDateKey = new Date(o.date).toISOString().split('T')[0];
    if (oDateKey === dateKey) {
      occurrencesByTemplate.set(o.templateId, o);
    }
  }

  // Get materialized todo IDs for this date
  const materializedIds = new Set<string>();
  for (const o of allOccurrences) {
    const oDateKey = new Date(o.date).toISOString().split('T')[0];
    if (oDateKey === dateKey && o.materializedTodoId) {
      materializedIds.add(o.materializedTodoId);
    }
  }

  const virtualTodos: Todo[] = [];
  for (const template of templates) {
    if (!template.repeatRule) continue;
    if (!dateMatchesRule(d, template.repeatRule)) continue;

    // Check if there's already a materialized todo for this date
    const occurrence = occurrencesByTemplate.get(template.id);
    if (occurrence?.materializedTodoId) {
      // The materialized todo will be fetched separately
      continue;
    }

    virtualTodos.push(computeVirtualTodo(template, d, occurrence));
  }

  return virtualTodos;
}

export async function getVirtualTodosForDateRange(
  start: Date,
  end: Date
): Promise<Todo[]> {
  const templates = await getRepeatTemplates();
  if (templates.length === 0) return [];

  const virtualTodos: Todo[] = [];
  const endTime = new Date(end).setHours(0, 0, 0, 0);

  // Pre-load all occurrences in range
  const allOccurrences = await db.repeatOccurrences.toArray();
  const occurrencesByKey = new Map<string, typeof allOccurrences[0]>();
  for (const o of allOccurrences) {
    const key = `${o.templateId}:${new Date(o.date).toISOString().split('T')[0]}`;
    occurrencesByKey.set(key, o);
  }

  for (const template of templates) {
    if (!template.repeatRule) continue;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const ruleEnd = template.repeatRule.endDate
      ? new Date(template.repeatRule.endDate).setHours(0, 0, 0, 0)
      : undefined;

    while (current.getTime() <= endTime) {
      if (ruleEnd && current.getTime() > ruleEnd) break;

      if (dateMatchesRule(current, template.repeatRule)) {
        const dateKey = current.toISOString().split('T')[0];
        const occurrence = occurrencesByKey.get(`${template.id}:${dateKey}`);

        if (!occurrence?.materializedTodoId) {
          virtualTodos.push(computeVirtualTodo(template, new Date(current), occurrence));
        }
      }

      current.setDate(current.getDate() + 1);
    }
  }

  return virtualTodos;
}

// ─── Query Functions (merge real + virtual) ───

export async function getTodaysTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const realTodos = await db.todos
    .where('scheduledDate')
    .between(today, tomorrow)
    .and((t) => t.status !== 'done')
    .toArray();

  const virtualTodos = await getVirtualTodosForDate(today);

  // Filter out virtual todos whose template is already represented by a materialized todo
  const materializedIds = new Set(
    (await db.repeatOccurrences.toArray())
      .filter((o) => {
        const d = new Date(o.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime() && o.materializedTodoId;
      })
      .map((o) => o.materializedTodoId!)
  );

  const filteredReal = realTodos.filter((t) => !materializedIds.has(t.id));

  return [...filteredReal, ...virtualTodos];
}

export async function getTodosForDate(date: Date): Promise<Todo[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const realTodos = await db.todos.where('scheduledDate').between(start, end).toArray();
  const virtualTodos = await getVirtualTodosForDate(date);

  // Filter out materialized todos from real results (they're already there)
  return [...realTodos, ...virtualTodos];
}

export async function getUnscheduledTodos(): Promise<Todo[]> {
  return db.todos
    .filter((t) => !t.scheduledDate && t.status !== 'done')
    .toArray();
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return db.todos
    .where('dueDate')
    .below(now)
    .and((t) => t.status !== 'done')
    .toArray();
}

export async function getInProgressTodos(): Promise<Todo[]> {
  return db.todos.where('status').equals('in_progress').toArray();
}

export async function getUnscheduledHighPriorityTodos(): Promise<Todo[]> {
  return db.todos
    .filter((t) => !t.scheduledDate && t.status !== 'done' && t.priority === 'high')
    .toArray();
}

export async function getTodosByTag(tag: string): Promise<Todo[]> {
  return db.todos.filter((t) => t.tags.includes(tag)).toArray();
}

export async function getRepeatTemplates(): Promise<Todo[]> {
  return db.todos.filter((t) => t.repeatRule !== undefined).toArray();
}

export async function updateRepeatRule(
  id: string,
  rule: RepeatRule | undefined
): Promise<void> {
  await db.todos.update(id, { repeatRule: rule, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}
