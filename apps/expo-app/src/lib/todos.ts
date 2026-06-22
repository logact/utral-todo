import { getAll, getById, upsert, remove, TODOS_KEY, type Todo } from './database';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now(): string {
  return new Date().toISOString();
}

export async function getAllTodos(): Promise<Todo[]> {
  const todos = await getAll<Todo>(TODOS_KEY);
  return todos.filter((t) => !t.deletedAt).sort((a, b) => a.order - b.order);
}

export async function getTodo(id: string): Promise<Todo | null> {
  return getById<Todo>(TODOS_KEY, id);
}

export async function getTodayTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  const today = new Date().toISOString().split('T')[0];
  return todos.filter((t) => t.scheduledDate?.startsWith(today) && t.status !== 'done');
}

export async function getInProgressTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  return todos.filter((t) => t.status === 'in_progress');
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const todos = await getAllTodos();
  const today = new Date().toISOString().split('T')[0];
  return todos.filter(
    (t) => t.dueDate && t.dueDate < today && t.status !== 'done'
  );
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
  const existing = await getById<Todo>(TODOS_KEY, id);
  if (!existing) return null;
  const updated = {
    ...existing,
    status,
    completedAt: status === 'done' ? now() : undefined,
    updatedAt: now(),
  };
  return upsert(TODOS_KEY, updated);
}

export async function createTodo(data: Partial<Todo>): Promise<Todo> {
  const todo: Todo = {
    id: generateId(),
    title: data.title || 'Untitled',
    description: data.description || '',
    status: data.status || 'pending',
    priority: data.priority || 'medium',
    estimatedMinutes: data.estimatedMinutes || 0,
    scheduledDate: data.scheduledDate,
    dueDate: data.dueDate,
    tags: data.tags || [],
    order: data.order || 0,
    nodeType: data.nodeType || 'task',
    createdAt: now(),
    updatedAt: now(),
  };
  return upsert(TODOS_KEY, todo);
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<Todo | null> {
  const existing = await getById<Todo>(TODOS_KEY, id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: now() };
  return upsert(TODOS_KEY, updated);
}

export async function deleteTodo(id: string): Promise<void> {
  const existing = await getById<Todo>(TODOS_KEY, id);
  if (existing) {
    await upsert(TODOS_KEY, { ...existing, deletedAt: now(), updatedAt: now() });
  }
}
