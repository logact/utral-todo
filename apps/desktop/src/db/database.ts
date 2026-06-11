import Dexie, { type EntityTable } from 'dexie';
import type { Todo, TodoRelation, TodoLog, ActionEdge, Pluse, Project, TimerSession, RepeatOccurrence } from '../types';

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

import type { Roadmap } from '../types';

const db = new Dexie('TodoScheduleDB') as Dexie & {
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

db.version(25).stores({
  todos: 'id, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
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
}).upgrade(async (tx) => {
  // Migrate existing assign_from recurring instances to RepeatOccurrence records
  const relations = await tx.table('relations').toArray();
  const assignFromRels = relations.filter((r) => r.type === 'assign_from');

  for (const rel of assignFromRels) {
    const template = await tx.table('todos').get(rel.fromTodoId);
    const instance = await tx.table('todos').get(rel.toTodoId);

    if (!template || !instance || !template.repeatRule) continue;

    const date = instance.scheduledDate ? new Date(instance.scheduledDate) : new Date();
    date.setHours(0, 0, 0, 0);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const hasLogs = (await tx.table('todoLogs').where('todoId').equals(instance.id).count()) > 0;
    const isModified = instance.status !== 'pending' || hasLogs;

    if (isModified) {
      // Preserve as a materialized occurrence
      await tx.table('repeatOccurrences').add({
        id: `repeat:${template.id}:${dateKey}`,
        templateId: template.id,
        date: date,
        status: instance.status,
        completedAt: instance.completedAt ? new Date(instance.completedAt) : undefined,
        materializedTodoId: instance.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      // Delete unmodified instance and its relation
      await tx.table('todos').delete(instance.id);
      await tx.table('relations').delete(rel.id);
    }
  }
});

db.version(26).stores({
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

db.version(27).stores({
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

db.version(28).stores({
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

db.version(29).stores({
  todos: 'id, nodeType, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
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
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    let nodeType = 'task';
    if (todo.isGoal === true) {
      nodeType = 'goal';
    } else {
      }
    await tx.table('todos').update(todo.id, { nodeType });
  }
});

db.version(30).stores({
  todos: 'id, nodeType, projectId, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
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
  // Drop the roadmaps table
  await tx.table('roadmaps').clear();
});

db.version(31).stores({
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

db.version(32).stores({
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

export async function clearAllData(): Promise<void> {
  await db.todos.clear();
  await db.relations.clear();
  await db.todoLogs.clear();
  await db.actionEdges.clear();
  await db.roadmaps.clear();
  await db.pluses.clear();
  await db.projects.clear();
  await db.timerSessions.clear();
  await db.repeatOccurrences.clear();
  await db.syncQueue.clear();
  await db.syncState.clear();
}

export { db };
