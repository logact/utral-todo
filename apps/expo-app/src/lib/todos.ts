import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Todo } from '@utral/types';
import { notifyDbOperation } from './sync';
import { getDeviceId } from './database';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getAllTodos(): Promise<Todo[]> {
  const rows = await db
    .select()
    .from(schema.todos)
    .where(eq(schema.todos.isDeleted, false))
    .orderBy(asc(schema.todos.order));
  return rows as unknown as Todo[];
}

export async function getTodo(id: string): Promise<Todo | null> {
  const rows = await db.select().from(schema.todos).where(eq(schema.todos.id, id)).limit(1);
  return rows.length > 0 ? (rows[0] as unknown as Todo) : null;
}

export async function getTodayTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todos = await getAllTodos();
  return todos.filter((t) => {
    if (t.nodeType !== 'task' || !t.scheduledDate) return false;
    const schedDate = t.scheduledDate instanceof Date ? t.scheduledDate : new Date(t.scheduledDate);
    return schedDate >= today && schedDate < tomorrow;
  });
}

export async function getInProgressTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  return todos.filter((t) => t.status === 'in_progress' && t.nodeType === 'task');
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todos = await getAllTodos();
  return todos.filter((t) => {
    if (t.nodeType !== 'task' || !t.dueDate || t.status === 'done') return false;
    const dueDate = t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate);
    return dueDate < today;
  });
}

export async function getTodayGoals(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todos = await getAllTodos();
  return todos.filter((t) => {
    if (t.nodeType !== 'goal' || !t.targetDate) return false;
    const targetDate = t.targetDate instanceof Date ? t.targetDate : new Date(t.targetDate);
    return targetDate >= today && targetDate < tomorrow;
  });
}

export async function getUnscheduledHighPriorityTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  return todos.filter(
    (t) =>
      t.nodeType === 'task' &&
      !t.scheduledDate &&
      t.status !== 'done' &&
      t.priority === 'high'
  );
}

export async function updateTodoStatus(id: string, status: Todo['status']): Promise<Todo | null> {
  const existing = await getTodo(id);
  if (!existing) return null;
  const now = Date.now();
  const updates: Record<string, unknown> = {
    status,
    updatedAtWall: now,
  };
  if (status === 'in_progress') updates.startedAt = new Date();
  if (status === 'pending') updates.startedAt = null;
  if (status === 'done') updates.completedAt = new Date();

  await db.update(schema.todos).set(updates).where(eq(schema.todos.id, id));
  notifyDbOperation('todo', 'update', id);
  return getTodo(id);
}

export async function updateTodoSchedule(id: string, scheduledDate: Date | null): Promise<Todo | null> {
  const existing = await getTodo(id);
  if (!existing) return null;
  await db
    .update(schema.todos)
    .set({ scheduledDate, updatedAtWall: Date.now() })
    .where(eq(schema.todos.id, id));
  notifyDbOperation('todo', 'update', id);
  return getTodo(id);
}

export async function createTodo(data: Partial<Todo>): Promise<Todo> {
  const id = generateId();
  const deviceId = await getDeviceId();
  const now = Date.now();
  const todo = {
    id,
    title: data.title || 'Untitled',
    description: data.description || '',
    status: data.status || 'pending' as const,
    priority: data.priority || 'medium' as const,
    estimatedMinutes: data.estimatedMinutes || 0,
    scheduledDate: data.scheduledDate || null,
    scheduledEndDate: data.scheduledEndDate || null,
    dueDate: data.dueDate || null,
    tags: data.tags || [],
    order: data.order || 0,
    nodeType: data.nodeType || 'task' as const,
    pattern: data.pattern || null,
    parentId: data.parentId || null,
    activePlanId: data.activePlanId || null,
    isRootGoal: data.isRootGoal || null,
    isSystemTask: data.isSystemTask || null,
    motivation: data.motivation || null,
    successCriteria: data.successCriteria || null,
    targetDate: data.targetDate || null,
    repeatRule: data.repeatRule || null,
    startedAt: data.startedAt || null,
    completedAt: data.completedAt || null,
    createdAtWall: now,
    createdAtCounter: 0,
    createdAtNode: deviceId,
    updatedAtWall: now,
    updatedAtCounter: 0,
    updatedAtNode: deviceId,
  };
  await db.insert(schema.todos).values(todo);
  notifyDbOperation('todo', 'create', id);
  return todo as unknown as Todo;
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<Todo | null> {
  const existing = await getTodo(id);
  if (!existing) return null;
  const { id: _, createdAt: _c, updatedAt: _u, ...updateFields } = updates as any;
  const now = Date.now();
  await db
    .update(schema.todos)
    .set({ ...updateFields, updatedAtWall: now })
    .where(eq(schema.todos.id, id));
  notifyDbOperation('todo', 'update', id);
  return getTodo(id);
}

export async function deleteTodo(id: string): Promise<void> {
  const existing = await getTodo(id);
  if (existing) {
    const now = Date.now();
    await db
      .update(schema.todos)
      .set({ isDeleted: true, updatedAtWall: now })
      .where(eq(schema.todos.id, id));
    notifyDbOperation('todo', 'delete', id);
  }
}
