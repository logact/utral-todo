import Dexie, { type EntityTable } from 'dexie';
import type { Todo, TodoRelation, TodoLog, Roadmap, ActionEdge, Pluse, Project, TimerSession } from '../types';

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

const db = new Dexie('TodoScheduleDB') as Dexie & {
  todos: EntityTable<Todo, 'id'>;
  relations: EntityTable<TodoRelation, 'id'>;
  todoLogs: EntityTable<TodoLog, 'id'>;
  roadmaps: EntityTable<Roadmap, 'id'>;
  actionEdges: EntityTable<ActionEdge, 'id'>;
  pluses: EntityTable<Pluse, 'id'>;
  projects: EntityTable<Project, 'id'>;
  timerSessions: EntityTable<TimerSession, 'id'>;
  syncQueue: EntityTable<SyncQueueItem, 'id'>;
  syncState: EntityTable<SyncState, 'key'>;
};

db.version(1).stores({
  projects: 'id, status, createdAt',
  tasks: 'id, projectId, status, scheduledDate, dueDate',
});

db.version(2).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, status, scheduledDate, dueDate, createdAt',
}).upgrade(async (tx) => {
  const oldTasks = await tx.table('tasks').toArray();
  if (oldTasks.length > 0) {
    const migrated = oldTasks.map((t: Record<string, unknown>) => ({
      ...t,
      createdAt: new Date(),
    }));
    await tx.table('todos').bulkAdd(migrated);
  }
});

db.version(3).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, status, scheduledDate, dueDate, createdAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    await tx.table('todos').update(todo.id, { tags: [] });
  }
});

db.version(4).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt',
});

db.version(5).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
});

db.version(6).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(7).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(8).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(9).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(10).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    if (todo.plan && Array.isArray(todo.plan) && todo.plan.length > 0) {
      for (let i = 0; i < todo.plan.length; i++) {
        const step = todo.plan[i];
        const childTodo = {
          id: crypto.randomUUID(),
          projectId: todo.projectId,
          parentId: todo.id,
          title: step.title || 'Untitled step',
          description: '',
          status: step.isCompleted ? 'done' : 'pending',
          priority: todo.priority || 'medium',
          estimatedMinutes: 15,
          tags: [],
          createdAt: new Date(),
          order: i,
        };
        await tx.table('todos').add(childTodo);
      }
      await tx.table('todos').update(todo.id, { plan: undefined });
    }
    if (todo.order === undefined) {
      await tx.table('todos').update(todo.id, { order: 0 });
    }
  }
});

db.version(11).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    if (todo.instructions === undefined) {
      await tx.table('todos').update(todo.id, { instructions: '' });
    }
  }
});

db.version(12).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId',
});

db.version(13).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
});

db.version(14).stores({
  projects: 'id, status, createdAt',
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
});

db.version(15).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
});

db.version(16).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
});

db.version(17).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    if (todo.status === 'in_progress' && todo.startedAt === undefined) {
      await tx.table('todos').update(todo.id, { startedAt: new Date() });
    }
  }
});

db.version(18).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
}).upgrade(async (tx) => {
  const pluses = await tx.table('pluses').toArray();
  for (const pluse of pluses) {
    const intervals: number[] = [];
    if (pluse.items && Array.isArray(pluse.items)) {
      for (const step of pluse.items) {
        if (step.type === 'block' && step.items) {
          for (const item of step.items) {
            intervals.push(item.durationMinutes || 25);
          }
        } else if (step.durationMinutes) {
          intervals.push(step.durationMinutes);
        }
      }
    }
    await tx.table('pluses').update(pluse.id, {
      intervals: intervals.length > 0 ? intervals : [25],
      repeatCount: 1,
    });
  }
});

db.version(19).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
  projects: 'id, status, createdAt',
});

db.version(20).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
  projects: 'id, status, createdAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
});

db.version(21).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(async (tx) => {
  // Backfill updatedAt from createdAt for all existing records
  const tables = ['todos', 'relations', 'todoLogs', 'actionEdges', 'pluses', 'projects'];
  for (const tableName of tables) {
    const items = await tx.table(tableName).toArray();
    for (const item of items) {
      if (!item.updatedAt) {
        await tx.table(tableName).update(item.id, { updatedAt: item.createdAt || new Date() });
      }
    }
  }
});

db.version(22).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(23).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(async (tx) => {
  // Migrate pluse intervals from minutes to seconds
  const pluses = await tx.table('pluses').toArray();
  for (const pluse of pluses) {
    if (Array.isArray(pluse.intervals)) {
      const newIntervals = pluse.intervals.map((d: number) => d * 60);
      await tx.table('pluses').update(pluse.id, { intervals: newIntervals });
    }
  }
});

db.version(24).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  projects: 'id, status, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(async (tx) => {
  // Backfill autoAdvance to true for existing pluses
  const pluses = await tx.table('pluses').toArray();
  for (const pluse of pluses) {
    if (pluse.autoAdvance === undefined) {
      await tx.table('pluses').update(pluse.id, { autoAdvance: true });
    }
  }
});

export async function clearAllData(): Promise<void> {
  await db.todos.clear();
  await db.relations.clear();
  await db.todoLogs.clear();
  await db.roadmaps.clear();
  await db.actionEdges.clear();
  await db.pluses.clear();
  await db.projects.clear();
  await db.timerSessions.clear();
  await db.syncQueue.clear();
  await db.syncState.clear();
}

export { db };
