import Dexie, { type EntityTable } from 'dexie';
import type { Todo, TodoRelation, TodoLog, ActionEdge, Pluse, Project, TimerSession, RepeatOccurrence, Roadmap } from '@utral/types';

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
  roadmaps: EntityTable<Roadmap, 'id'>;
  pluses: EntityTable<Pluse, 'id'>;
  projects: EntityTable<Project, 'id'>;
  timerSessions: EntityTable<TimerSession, 'id'>;
  repeatOccurrences: EntityTable<RepeatOccurrence, 'id'>;
  syncQueue: EntityTable<SyncQueueItem, 'id'>;
  syncState: EntityTable<SyncState, 'key'>;
};

db.version(1).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(2).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade((tx) => {
  // Drop the roadmaps table in v2
  return tx.table('roadmaps').clear();
});

db.version(3).stores({
  todos: 'id, nodeType, pattern, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
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
  todos: 'id, nodeType, pattern, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

export { db };
