import { eq, and, isNull, asc } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Todo } from './database';
import { scheduleSyncPush } from './auto-sync';

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getAllTodos(): Promise<Todo[]> {
  const rows = await db
    .select()
    .from(schema.todos)
    .where(isNull(schema.todos.deletedAt))
    .orderBy(asc(schema.todos.order));
  return rows as Todo[];
}

export async function getTodo(id: string): Promise<Todo | null> {
  const rows = await db.select().from(schema.todos).where(eq(schema.todos.id, id)).limit(1);
  return rows.length > 0 ? (rows[0] as Todo) : null;
}

export async function getTodayTodos(): Promise<Todo[]> {
  const today = new Date().toISOString().split('T')[0];
  const todos = await getAllTodos();
  return todos.filter((t) => t.scheduledDate?.startsWith(today) && t.status !== 'done');
}

export async function getInProgressTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  return todos.filter((t) => t.status === 'in_progress');
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const today = new Date().toISOString().split('T')[0];
  const todos = await getAllTodos();
  return todos.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'done');
}

export async function getTodayGoals(): Promise<Todo[]> {
  const todos = await getAllTodos();
  return todos.filter((t) => t.nodeType === 'goal' && t.goalStatus === 'active');
}

export async function getUnscheduledHighPriorityTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  return todos.filter(
    (t) => !t.scheduledDate && (t.priority === 'high' || t.priority === 'medium') && t.status !== 'done'
  );
}

export async function updateTodoStatus(id: string, status: Todo['status']): Promise<Todo | null> {
  const existing = await getTodo(id);
  if (!existing) return null;
  const timestamp = now();
  await db
    .update(schema.todos)
    .set({
      status,
      updatedAt: timestamp,
    })
    .where(eq(schema.todos.id, id));
  scheduleSyncPush();
  return getTodo(id);
}

export async function createTodo(data: Partial<Todo>): Promise<Todo> {
  const id = generateId();
  const timestamp = now();
  const todo = {
    id,
    title: data.title || 'Untitled',
    description: data.description || '',
    status: data.status || 'pending' as const,
    priority: data.priority || 'medium' as const,
    estimatedMinutes: data.estimatedMinutes || 0,
    scheduledDate: data.scheduledDate || null,
    dueDate: data.dueDate || null,
    tags: data.tags || [],
    order: data.order || 0,
    nodeType: data.nodeType || 'task' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.insert(schema.todos).values(todo);
  scheduleSyncPush();
  return todo as Todo;
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<Todo | null> {
  const existing = await getTodo(id);
  if (!existing) return null;
  const { id: _, createdAt: _c, ...updateFields } = updates as any;
  await db
    .update(schema.todos)
    .set({ ...updateFields, updatedAt: now() })
    .where(eq(schema.todos.id, id));
  scheduleSyncPush();
  return getTodo(id);
}

export async function deleteTodo(id: string): Promise<void> {
  const existing = await getTodo(id);
  if (existing) {
    const timestamp = now();
    await db
      .update(schema.todos)
      .set({ deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(schema.todos.id, id));
    scheduleSyncPush();
  }
}
