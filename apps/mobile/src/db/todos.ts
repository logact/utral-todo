import { db } from './database';
import type { Todo, TodoStatus, Priority, RepeatRule } from '@utral/types';

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
    status?: TodoStatus;
  }
): Promise<Todo> {
  const now = new Date();
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    description: options?.description ?? '',
    instructions: options?.instructions ?? '',
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
    repeatRule: options?.repeatRule,
    order: options?.order ?? 0,
    isGoal: options?.isGoal,
  };
  await db.todos.add(todo);
  return todo;
}

export async function getAllTodos(): Promise<Todo[]> {
  return db.todos.toArray();
}

export async function getTodo(id: string): Promise<Todo | undefined> {
  return db.todos.get(id);
}

export async function getTodaysTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return db.todos
    .where('scheduledDate')
    .between(today, tomorrow, true, false)
    .and((t) => t.status !== 'done')
    .toArray();
}

export async function getInProgressTodos(): Promise<Todo[]> {
  return db.todos.where('status').equals('in_progress').toArray();
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return db.todos
    .where('dueDate')
    .below(today)
    .and((t) => t.status !== 'done')
    .toArray();
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<void> {
  await db.todos.update(id, { ...updates, updatedAt: new Date() });
}

export async function updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
  const now = new Date();

  if (status === 'in_progress') {
    const others = await db.todos.where('status').equals('in_progress').and((t) => t.id !== id).toArray();
    for (const todo of others) {
      await db.todos.update(todo.id, { status: 'pending', updatedAt: now });
    }
  }

  const updates: Partial<Todo> = { status, updatedAt: now };
  if (status === 'done') {
    updates.completedAt = now;
  } else if (status === 'in_progress') {
    updates.startedAt = now;
  }
  await db.todos.update(id, updates);
}

export async function deleteTodo(id: string): Promise<void> {
  await db.todos.delete(id);
}

export async function addTodo(options: { title: string; projectId?: string; scheduledDate?: Date }): Promise<Todo> {
  return createTodo(options.title, {
    projectId: options.projectId,
    scheduledDate: options.scheduledDate,
  });
}
