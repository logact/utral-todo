import Dexie, { type EntityTable } from 'dexie';
import type { Todo, TodoRelation, TodoLog, ActionEdge, Pluse, TimerSession, RepeatOccurrence } from '@utral/types';

export interface SyncQueueItem {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  createdAt: Date;
  retryCount: number;
  lastError?: string;
}

export interface SyncState {
  key: string;
  value: string;
}

const db = new Dexie('UtralMobileDB') as Dexie & {
  todos: EntityTable<Todo, 'id'>;
  relations: EntityTable<TodoRelation, 'id'>;
  todoLogs: EntityTable<TodoLog, 'id'>;
  actionEdges: EntityTable<ActionEdge, 'id'>;
  pluses: EntityTable<Pluse, 'id'>;
  timerSessions: EntityTable<TimerSession, 'id'>;
  repeatOccurrences: EntityTable<RepeatOccurrence, 'id'>;
  syncQueue: EntityTable<SyncQueueItem, 'id'>;
  syncState: EntityTable<SyncState, 'key'>;
};

db.version(1).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(2).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade((tx) => {
  // Drop the roadmaps table in v2
  return tx.table('roadmaps').clear();
});

db.version(3).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    if (todo.pattern === undefined) {
      await tx.table('todos').update(todo.id, { pattern: 'task' });
    }
  }
});

db.version(4).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(5).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade((tx) => {
  // Drop the projects table in v5
  return tx.table('projects').clear();
});

db.version(6).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(() => {
  // v6 removes roadmaps from the app schema; the legacy object store will remain
  // in IndexedDB until the database is deleted, but is no longer accessible.
});

export { db };
