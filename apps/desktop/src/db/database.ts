import Dexie, { type EntityTable } from 'dexie';
import type { Todo, TodoRelation, TodoLog, ActionEdge, Pluse, TimerSession, RepeatOccurrence, Roadmap, Plan } from '../types';

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
  actionEdges: EntityTable<ActionEdge, 'id'>;
  roadmaps: EntityTable<Roadmap, 'id'>;
  plans: EntityTable<Plan, 'id'>;
  pluses: EntityTable<Pluse, 'id'>;
  timerSessions: EntityTable<TimerSession, 'id'>;
  repeatOccurrences: EntityTable<RepeatOccurrence, 'id'>;
  syncQueue: EntityTable<SyncQueueItem, 'id'>;
  syncState: EntityTable<SyncState, 'key'>;
};

db.version(1).stores({
  tasks: 'id, status, scheduledDate, dueDate',
});

db.version(2).stores({
  todos: 'id, status, scheduledDate, dueDate, createdAt',
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
  todos: 'id, status, scheduledDate, dueDate, createdAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    await tx.table('todos').update(todo.id, { tags: [] });
  }
});

db.version(4).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt',
});

db.version(5).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
});

db.version(6).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(7).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(8).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(9).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(10).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
});

db.version(12).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId',
});

db.version(13).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
});

db.version(14).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
});

db.version(15).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
});

db.version(16).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
});

db.version(17).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
});

db.version(20).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt',
  todoLogs: 'id, todoId, type, createdAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt',
  pluses: 'id, createdAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
});

db.version(21).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(async (tx) => {
  // Backfill updatedAt from createdAt for all existing records
  const tables = ['todos', 'relations', 'todoLogs', 'actionEdges', 'pluses'];
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(23).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
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
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(27).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(28).stores({
  todos: 'id, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(29).stores({
  todos: 'id, nodeType, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
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
  todos: 'id, nodeType, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
}).upgrade(async (tx) => {
  // Drop the roadmaps table
  await tx.table('roadmaps').clear();
});

db.version(31).stores({
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

db.version(32).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(33).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
});

db.version(34).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
  plans: 'id, goalTodoId, updatedAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  const goals = todos.filter((t) => t.nodeType === 'goal');
  for (const goal of goals) {
    const planId = crypto.randomUUID();
    const now = new Date();
    await tx.table('plans').add({
      id: planId,
      goalTodoId: goal.id,
      title: 'Default Plan',
      todoIds: [],
      createdAt: now,
      updatedAt: now,
    });
    await tx.table('todos').update(goal.id, { activePlanId: planId });
  }
});

db.version(35).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
  plans: 'id, goalTodoId, updatedAt',
}).upgrade(async (tx) => {
  const plans = await tx.table('plans').toArray();
  for (const plan of plans) {
    if (
      plan.title === 'Default Plan' &&
      Array.isArray(plan.todoIds) &&
      plan.todoIds.length === 1 &&
      plan.todoIds[0] === plan.goalTodoId
    ) {
      await tx.table('plans').update(plan.id, { todoIds: [], updatedAt: new Date() });
    }
  }
});

db.version(36).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
  plans: 'id, goalTodoId, updatedAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  const goals = todos.filter((t) => t.nodeType === 'goal');
  for (const goal of goals) {
    const existingPlans = await tx.table('plans').where('goalTodoId').equals(goal.id).toArray();
    if (existingPlans.length > 0) continue;

    const planId = crypto.randomUUID();
    const now = new Date();
    await tx.table('plans').add({
      id: planId,
      goalTodoId: goal.id,
      title: 'Default Plan',
      todoIds: [],
      createdAt: now,
      updatedAt: now,
    });
    await tx.table('todos').update(goal.id, { activePlanId: planId });
  }
});

db.version(38).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, isRootGoal, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
  plans: 'id, goalTodoId, isSystemPlan, updatedAt',
}).upgrade(async (tx) => {
  const todos = await tx.table('todos').toArray();
  const relations = await tx.table('relations').toArray();
  const plans = await tx.table('plans').toArray();

  // Backfill isSystemPlan on existing plans
  for (const plan of plans) {
    if (plan.isSystemPlan === undefined) {
      await tx.table('plans').update(plan.id, { isSystemPlan: false });
    }
  }

  // Create root goal if it does not exist
  const hasRoot = todos.some((t) => t.isRootGoal === true);
  if (!hasRoot) {
    const now = new Date();
    const rootGoal = {
      id: 'system:root-goal',
      nodeType: 'goal',
      title: 'Root Goal',
      description: '',
      isRootGoal: true,
      goalStatus: 'active',
      tags: [],
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    await tx.table('todos').add(rootGoal);

    const hasParent = new Set<string>();
    for (const r of relations) {
      if (r.type === 'parent_of' || r.type === 'source_from') {
        hasParent.add(r.toTodoId);
      }
    }

    const topLevelGoalIds = todos
      .filter(
        (t) =>
          t.nodeType === 'goal' &&
          !t.parentId &&
          !hasParent.has(t.id) &&
          t.id !== rootGoal.id
      )
      .map((t) => t.id);

    const planId = crypto.randomUUID();
    await tx.table('plans').add({
      id: planId,
      goalTodoId: rootGoal.id,
      title: 'Root Road',
      nodeIds: topLevelGoalIds,
      edgeIds: [],
      isSystemPlan: true,
      createdAt: now,
      updatedAt: now,
    });

    await tx.table('todos').update(rootGoal.id, { activePlanId: planId });
  }
});

db.version(39).stores({
  todos: 'id, nodeType, pattern, parentId, status, scheduledDate, dueDate, createdAt, updatedAt, order, startedAt, isRootGoal, [status+scheduledDate]',
  relations: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  todoLogs: 'id, todoId, type, createdAt, updatedAt',
  roadmaps: 'id, goalTodoId, updatedAt',
  actionEdges: 'id, fromTodoId, toTodoId, type, createdAt, updatedAt',
  pluses: 'id, createdAt, updatedAt',
  timerSessions: 'id, type, status, createdAt, updatedAt',
  repeatOccurrences: 'id, templateId, date',
  syncQueue: 'id, table, operation, recordId, createdAt, retryCount',
  syncState: 'key',
  plans: 'id, goalTodoId, isSystemPlan, updatedAt',
}).upgrade(async (tx) => {
  // Clear orphaned project data
  await tx.table('projects').clear();
  const todos = await tx.table('todos').toArray();
  for (const todo of todos) {
    if (todo.projectId !== undefined) {
      await tx.table('todos').update(todo.id, { projectId: undefined });
    }
  }
});

export async function clearAllData(): Promise<void> {
  await db.todos.clear();
  await db.relations.clear();
  await db.todoLogs.clear();
  await db.actionEdges.clear();
  await db.roadmaps.clear();
  await db.plans.clear();
  await db.pluses.clear();
  await db.timerSessions.clear();
  await db.repeatOccurrences.clear();
  await db.syncQueue.clear();
  await db.syncState.clear();
}

export { db };
