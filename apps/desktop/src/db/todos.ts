import { db } from './database';
import { createRelation } from './relations';
import { onLocalChange } from './syncEngine';
import type { Todo, TodoStatus, Priority, RepeatRule } from '../types';

export async function createTodo(
  title: string,
  options?: {
    parentId?: string;
    projectId?: string;
    description?: string;
    instructions?: string;
    priority?: Priority;
    estimatedMinutes?: number;
    dueDate?: Date;
    scheduledDate?: Date;
    tags?: string[];
    repeatRule?: RepeatRule;
    order?: number;
    isGoal?: boolean;
  }
): Promise<Todo> {
  const now = new Date();
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    description: options?.description ?? '',
    instructions: options?.instructions ?? '',
    status: 'pending',
    priority: options?.priority ?? 'medium',
    estimatedMinutes: options?.estimatedMinutes ?? 60,
    tags: options?.tags ?? [],
    createdAt: now,
    updatedAt: now,
    projectId: options?.projectId,
    parentId: options?.parentId,
    dueDate: options?.dueDate,
    scheduledDate: options?.scheduledDate,
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

export async function getTodaysTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const all = await db.todos.toArray();
  return all.filter((t) => {
    if (t.status === 'done') return false;
    if (!t.scheduledDate) return false;
    const d = new Date(t.scheduledDate);
    return d >= today && d < tomorrow;
  });
}

export async function getTodosForDate(date: Date): Promise<Todo[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const all = await db.todos.toArray();
  return all.filter((t) => {
    if (!t.scheduledDate) return false;
    const d = new Date(t.scheduledDate);
    return d >= start && d < end;
  });
}

export async function getUnscheduledTodos(): Promise<Todo[]> {
  const all = await db.todos.toArray();
  return all.filter((t) => !t.scheduledDate && t.status !== 'done');
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const all = await db.todos.toArray();
  return all.filter((t) => {
    if (t.status === 'done' || !t.dueDate) return false;
    return new Date(t.dueDate) < now;
  });
}

export async function getInProgressTodos(): Promise<Todo[]> {
  return db.todos.where('status').equals('in_progress').toArray();
}

export async function getUnscheduledHighPriorityTodos(): Promise<Todo[]> {
  const all = await db.todos.toArray();
  return all.filter(
    (t) => !t.scheduledDate && t.status !== 'done' && t.priority === 'high'
  );
}

export async function getTodosByTag(tag: string): Promise<Todo[]> {
  const all = await db.todos.toArray();
  return all.filter((t) => t.tags.includes(tag));
}

export async function getRepeatTemplates(): Promise<Todo[]> {
  const all = await db.todos.toArray();
  return all.filter((t) => t.repeatRule !== undefined);
}

export async function createRepeatInstance(
  template: Todo,
  scheduledDate: Date
): Promise<Todo> {
  const instance = await createTodo(template.title, {
    description: template.description,
    instructions: template.instructions,
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    projectId: template.projectId,
    tags: [...template.tags],
    scheduledDate,
  });

  await createRelation(template.id, instance.id, 'assign_from');
  return instance;
}

export async function syncRepeatInstances(
  _startDate: Date,
  _endDate: Date
): Promise<number> {
  const templates = await getRepeatTemplates();
  let createdCount = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const template of templates) {
    if (!template.repeatRule) continue;
    const rule = template.repeatRule;
    const endDate = rule.endDate ? new Date(rule.endDate) : new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

    if (rule.type === 'daily') {
      for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
        const exists = await checkInstanceExists(template.id, new Date(d));
        if (!exists) {
          await createRepeatInstance(template, new Date(d));
          createdCount++;
        }
      }
    } else if (rule.type === 'weekly' && rule.weekDays) {
      for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (rule.weekDays.includes(d.getDay())) {
          const exists = await checkInstanceExists(template.id, new Date(d));
          if (!exists) {
            await createRepeatInstance(template, new Date(d));
            createdCount++;
          }
        }
      }
    } else if (rule.type === 'every_n_days' && rule.interval) {
      for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + rule.interval)) {
        const exists = await checkInstanceExists(template.id, new Date(d));
        if (!exists) {
          await createRepeatInstance(template, new Date(d));
          createdCount++;
        }
      }
    }
  }

  return createdCount;
}

async function checkInstanceExists(templateId: string, date: Date): Promise<boolean> {
  const relations = await db.relations.where('fromTodoId').equals(templateId).and((r) => r.type === 'assign_from').toArray();
  for (const rel of relations) {
    const instance = await db.todos.get(rel.toTodoId);
    if (instance && instance.scheduledDate) {
      const d = new Date(instance.scheduledDate);
      d.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      if (d.getTime() === target.getTime()) return true;
    }
  }
  return false;
}

export async function updateRepeatRule(
  id: string,
  rule: RepeatRule | undefined
): Promise<void> {
  await db.todos.update(id, { repeatRule: rule, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}
