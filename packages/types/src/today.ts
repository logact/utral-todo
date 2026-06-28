import type { Todo } from './index.js';

/**
 * Pure filter functions that operate on arrays of todos.
 * These are DB-agnostic — both desktop (Dexie) and mobile (Drizzle/SQLite)
 * can call them after fetching raw data.
 */

export function filterTodayScheduled(todos: Todo[]): Todo[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return todos.filter((t) => {
    if (t.nodeType !== 'task' || t.isDeleted) return false;
    if (!t.scheduledDate) return false;
    const d = new Date(t.scheduledDate);
    return d >= today && d < tomorrow;
  });
}

export function filterInProgress(todos: Todo[]): Todo[] {
  return todos.filter(
    (t) => t.status === 'in_progress' && t.nodeType === 'task' && !t.isDeleted
  );
}

export function filterOverdue(todos: Todo[]): Todo[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return todos.filter(
    (t) =>
      t.nodeType === 'task' &&
      !t.isDeleted &&
      t.dueDate &&
      new Date(t.dueDate) < today &&
      t.status !== 'done'
  );
}

export function filterUnscheduledHighPriority(todos: Todo[]): Todo[] {
  return todos.filter(
    (t) =>
      t.nodeType === 'task' &&
      !t.isDeleted &&
      !t.scheduledDate &&
      t.status !== 'done' &&
      t.priority === 'high'
  );
}

export function filterTodayGoals(todos: Todo[]): Todo[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return todos.filter(
    (t) =>
      t.nodeType === 'goal' &&
      !t.isDeleted &&
      t.targetDate != null &&
      new Date(t.targetDate) >= today &&
      new Date(t.targetDate) < tomorrow
  );
}

/**
 * Merge and deduplicate today's data from 5 sources.
 * Priority order: overdue > in-progress > goals > suggested > scheduled
 */
export function mergeTodayData(params: {
  scheduled: Todo[];
  inProgress: Todo[];
  overdue: Todo[];
  goals: Todo[];
  suggested: Todo[];
}): { all: Todo[]; done: Todo[] } {
  const seen = new Set<string>();
  const all: Todo[] = [];
  const done: Todo[] = [];

  const add = (todo: Todo) => {
    if (seen.has(todo.id)) return;
    seen.add(todo.id);
    if (todo.status === 'done') {
      done.push(todo);
    } else {
      all.push(todo);
    }
  };

  // Priority order
  for (const t of params.overdue) add(t);
  for (const t of params.inProgress) add(t);
  for (const t of params.goals) add(t);
  for (const t of params.suggested) add(t);
  for (const t of params.scheduled) add(t);

  return { all, done };
}

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
