import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { InferInsertModel } from 'drizzle-orm';
import type {
  Todo,
  TodoRelation,
  TodoLog,
  ActionEdge,
  Plan,
  Pluse,
  TimerSession,
  RepeatOccurrence,
  TimeSlotDefinition,
  RepeatRule,
  NodeType,
  TaskPattern,
  TodoStatus,
  Priority,
  GoalStatus,
  TodoRelationType,
  TodoLogType,
  ActionEdgeType,
} from '../types';

// Re-export entity types for convenience
export type {
  Todo,
  TodoRelation,
  TodoLog,
  ActionEdge,
  Plan,
  Pluse,
  TimerSession,
  RepeatOccurrence,
  TimeSlotDefinition,
};

// ─── HLC column helpers ───

function hlcDateToObj(row: Record<string, unknown>, prefix: string) {
  const wall = row[`${prefix}Wall`] as number | null;
  const counter = row[`${prefix}Counter`] as number | undefined;
  const node = row[`${prefix}Node`] as string | null;
  if (wall == null) return undefined;
  return { wall, counter: counter ?? 0, node: node ?? '' };
}

function objToHlcColumns(obj: unknown, prefix: string) {
  const hlc = obj as { wall?: number; counter?: number; node?: string } | undefined | null;
  if (!hlc) return {};
  return {
    [`${prefix}Wall`]: hlc.wall ?? null,
    [`${prefix}Counter`]: hlc.counter ?? 0,
    [`${prefix}Node`]: hlc.node ?? null,
  };
}

// ─── Drizzle Schema ───

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  nodeType: text('node_type', { enum: ['goal', 'task'] }).notNull().default('task'),
  pattern: text('pattern', { enum: ['task', 'cognitive', 'timeSlot'] }),
  title: text('title').notNull().default('Untitled'),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['pending', 'in_progress', 'done'] }).notNull().default('pending'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  goalStatus: text('goal_status', { enum: ['active', 'paused', 'achieved', 'abandoned'] }),
  estimatedMinutes: integer('estimated_minutes').notNull().default(60),
  scheduledDate: integer('scheduled_date', { mode: 'timestamp' }),
  scheduledEndDate: integer('scheduled_end_date', { mode: 'timestamp' }),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  parentId: text('parent_id'),
  activePlanId: text('active_plan_id'),
  isRootGoal: integer('is_root_goal', { mode: 'boolean' }),
  isSystemTask: integer('is_system_task', { mode: 'boolean' }),
  motivation: text('motivation'),
  successCriteria: text('success_criteria'),
  targetDate: integer('target_date', { mode: 'timestamp' }),
  repeatRule: text('repeat_rule', { mode: 'json' }).$type<RepeatRule>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  order: integer('order').notNull().default(0),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('todos_node_type_idx').on(table.nodeType),
  index('todos_pattern_idx').on(table.pattern),
  index('todos_parent_id_idx').on(table.parentId),
  index('todos_status_idx').on(table.status),
  index('todos_scheduled_date_idx').on(table.scheduledDate),
  index('todos_due_date_idx').on(table.dueDate),
  index('todos_created_at_idx').on(table.createdAtWall),
  index('todos_updated_at_idx').on(table.updatedAtWall),
  index('todos_order_idx').on(table.order),
  index('todos_started_at_idx').on(table.startedAt),
  index('todos_status_scheduled_idx').on(table.status, table.scheduledDate),
]);

export const todoRelations = sqliteTable('todo_relations', {
  id: text('id').primaryKey(),
  fromTodoId: text('from_todo_id').notNull(),
  toTodoId: text('to_todo_id').notNull(),
  type: text('type').notNull(),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('todo_relations_from_idx').on(table.fromTodoId),
  index('todo_relations_to_idx').on(table.toTodoId),
  index('todo_relations_type_idx').on(table.type),
  index('todo_relations_created_at_idx').on(table.createdAtWall),
  index('todo_relations_updated_at_idx').on(table.updatedAtWall),
]);

export const todoLogs = sqliteTable('todo_logs', {
  id: text('id').primaryKey(),
  todoId: text('todo_id').notNull(),
  type: text('type').notNull(),
  content: text('content').notNull().default(''),
  minutesSpent: integer('minutes_spent'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('todo_logs_todo_id_idx').on(table.todoId),
  index('todo_logs_type_idx').on(table.type),
  index('todo_logs_created_at_idx').on(table.createdAtWall),
  index('todo_logs_updated_at_idx').on(table.updatedAtWall),
]);

export const actionEdges = sqliteTable('action_edges', {
  id: text('id').primaryKey(),
  fromTodoId: text('from_todo_id').notNull(),
  toTodoId: text('to_todo_id').notNull(),
  type: text('type').notNull(),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('action_edges_from_idx').on(table.fromTodoId),
  index('action_edges_to_idx').on(table.toTodoId),
  index('action_edges_type_idx').on(table.type),
  index('action_edges_created_at_idx').on(table.createdAtWall),
  index('action_edges_updated_at_idx').on(table.updatedAtWall),
]);

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  goalTodoId: text('goal_todo_id').notNull(),
  title: text('title').notNull().default('Untitled Plan'),
  nodeIds: text('node_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  edgeIds: text('edge_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  isSystemPlan: integer('is_system_plan', { mode: 'boolean' }),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('plans_goal_todo_id_idx').on(table.goalTodoId),
  index('plans_updated_at_idx').on(table.updatedAtWall),
]);

export const pluses = sqliteTable('pluses', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Untitled Pluse'),
  description: text('description').notNull().default(''),
  intervals: text('intervals', { mode: 'json' }).$type<number[]>().notNull().default([1500]),
  repeatCount: integer('repeat_count').notNull().default(1),
  intervalTodos: text('interval_todos', { mode: 'json' }).$type<Record<number, string>>(),
  autoAdvance: integer('auto_advance', { mode: 'boolean' }).notNull().default(true),
  timerStatus: text('timer_status', { enum: ['idle', 'running', 'paused'] }).notNull().default('idle'),
  currentIntervalIndex: integer('current_interval_index').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  accumulatedSeconds: integer('accumulated_seconds').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('pluses_created_at_idx').on(table.createdAtWall),
  index('pluses_updated_at_idx').on(table.updatedAtWall),
  index('pluses_timer_status_idx').on(table.timerStatus),
]);

export const timerSessions = sqliteTable('timer_sessions', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['stopwatch', 'pluse'] }).notNull(),
  name: text('name').notNull().default(''),
  pluseId: text('pluse_id'),
  todoId: text('todo_id'),
  intervals: text('intervals', { mode: 'json' }).$type<number[]>(),
  repeatCount: integer('repeat_count'),
  currentIndex: integer('current_index').notNull().default(0),
  elapsedSeconds: integer('elapsed_seconds').notNull().default(0),
  status: text('status', { enum: ['running', 'paused', 'completed'] }).notNull().default('running'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  pausedAt: integer('paused_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('timer_sessions_type_idx').on(table.type),
  index('timer_sessions_status_idx').on(table.status),
  index('timer_sessions_pluse_id_idx').on(table.pluseId),
]);

export const repeatOccurrences = sqliteTable('repeat_occurrences', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  status: text('status', { enum: ['pending', 'in_progress', 'done'] }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  materializedTodoId: text('materialized_todo_id'),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('repeat_occurrences_template_id_idx').on(table.templateId),
  index('repeat_occurrences_date_idx').on(table.date),
]);

export const timeSlots = sqliteTable('time_slots', {
  id: text('id').primaryKey(),
  milestoneId: text('milestone_id').notNull(),
  title: text('title').notNull().default(''),
  time: text('time').notNull().default(''),
  startHour: integer('start_hour').notNull().default(0),
  startMinute: integer('start_minute').notNull().default(0),
  endHour: integer('end_hour').notNull().default(0),
  endMinute: integer('end_minute').notNull().default(0),
  order: integer('order').notNull().default(0),
  createdAtWall: integer('created_at_wall'),
  createdAtCounter: integer('created_at_counter').notNull().default(0),
  createdAtNode: text('created_at_node'),
  updatedAtWall: integer('updated_at_wall'),
  updatedAtCounter: integer('updated_at_counter').notNull().default(0),
  updatedAtNode: text('updated_at_node'),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('time_slots_milestone_id_idx').on(table.milestoneId),
  index('time_slots_order_idx').on(table.order),
  index('time_slots_updated_at_idx').on(table.updatedAtWall),
]);

export const hlcState = sqliteTable('hlc_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
});

export const syncConfig = sqliteTable('sync_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  operation: text('operation').notNull(),
  recordId: text('record_id').notNull(),
  payload: text('payload'),
  createdAt: text('created_at').notNull(),
  retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
});

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// ─── Helper: convert raw DB row to entity type ───

function timestampToDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value * 1000); // SQLite stores seconds
  return undefined;
}

export function rowToTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as string,
    nodeType: row.nodeType as NodeType,
    pattern: row.pattern as TaskPattern | undefined,
    title: row.title as string,
    description: row.description as string,
    status: row.status as TodoStatus | undefined,
    priority: row.priority as Priority | undefined,
    goalStatus: row.goalStatus as GoalStatus | undefined,
    estimatedMinutes: row.estimatedMinutes as number | undefined,
    scheduledDate: timestampToDate(row.scheduledDate),
    scheduledEndDate: timestampToDate(row.scheduledEndDate),
    dueDate: timestampToDate(row.dueDate),
    startedAt: timestampToDate(row.startedAt),
    completedAt: timestampToDate(row.completedAt),
    parentId: row.parentId as string | undefined,
    activePlanId: row.activePlanId as string | undefined,
    isRootGoal: row.isRootGoal as boolean | undefined,
    isSystemTask: row.isSystemTask as boolean | undefined,
    motivation: row.motivation as string | undefined,
    successCriteria: row.successCriteria as string | undefined,
    targetDate: timestampToDate(row.targetDate),
    repeatRule: row.repeatRule as RepeatRule | undefined,
    tags: (row.tags as string[]) ?? [],
    order: (row.order as number) ?? 0,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function todoToRow(todo: Partial<Todo>): InferInsertModel<typeof todos> {
  const row= {} as InferInsertModel<typeof todos>;
  if (todo.id !== undefined) row.id = todo.id;
  if (todo.nodeType !== undefined) row.nodeType = todo.nodeType;
  if (todo.pattern !== undefined) row.pattern = todo.pattern;
  if (todo.title !== undefined) row.title = todo.title;
  if (todo.description !== undefined) row.description = todo.description;
  if (todo.status !== undefined) row.status = todo.status;
  if (todo.priority !== undefined) row.priority = todo.priority;
  if (todo.goalStatus !== undefined) row.goalStatus = todo.goalStatus;
  if (todo.estimatedMinutes !== undefined) row.estimatedMinutes = todo.estimatedMinutes;
  if (todo.scheduledDate !== undefined) row.scheduledDate = todo.scheduledDate ? todo.scheduledDate : null;
  if (todo.scheduledEndDate !== undefined) row.scheduledEndDate = todo.scheduledEndDate ? todo.scheduledEndDate : null;
  if (todo.dueDate !== undefined) row.dueDate = todo.dueDate ? todo.dueDate : null;
  if (todo.startedAt !== undefined) row.startedAt = todo.startedAt ? todo.startedAt : null;
  if (todo.completedAt !== undefined) row.completedAt = todo.completedAt ? todo.completedAt : null;
  if (todo.parentId !== undefined) row.parentId = todo.parentId;
  if (todo.activePlanId !== undefined) row.activePlanId = todo.activePlanId;
  if (todo.isRootGoal !== undefined) row.isRootGoal = todo.isRootGoal;
  if (todo.isSystemTask !== undefined) row.isSystemTask = todo.isSystemTask;
  if (todo.motivation !== undefined) row.motivation = todo.motivation;
  if (todo.successCriteria !== undefined) row.successCriteria = todo.successCriteria;
  if (todo.targetDate !== undefined) row.targetDate = todo.targetDate ? todo.targetDate: null;
  if (todo.repeatRule !== undefined) row.repeatRule = todo.repeatRule;
  if (todo.tags !== undefined) row.tags = todo.tags;
  if (todo.order !== undefined) row.order = todo.order;
  Object.assign(row, objToHlcColumns(todo.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(todo.updatedAt, 'updatedAt'));
  if (todo.isDeleted !== undefined) row.isDeleted = todo.isDeleted;
  return row as InferInsertModel<typeof todos>;
}

export function rowToRelation(row: Record<string, unknown>): TodoRelation {
  return {
    id: row.id as string,
    fromTodoId: row.fromTodoId as string,
    toTodoId: row.toTodoId as string,
    type: row.type as TodoRelationType,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function relationToRow(relation: Partial<TodoRelation>): InferInsertModel<typeof todoRelations> {
  const row: Record<string, unknown> = {};
  if (relation.id !== undefined) row.id = relation.id;
  if (relation.fromTodoId !== undefined) row.fromTodoId = relation.fromTodoId;
  if (relation.toTodoId !== undefined) row.toTodoId = relation.toTodoId;
  if (relation.type !== undefined) row.type = relation.type;
  Object.assign(row, objToHlcColumns(relation.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(relation.updatedAt, 'updatedAt'));
  if (relation.isDeleted !== undefined) row.isDeleted = relation.isDeleted;
  return row as InferInsertModel<typeof todoRelations>;
}

export function rowToTodoLog(row: Record<string, unknown>): TodoLog {
  return {
    id: row.id as string,
    todoId: row.todoId as string,
    type: row.type as TodoLogType,
    content: row.content as string,
    minutesSpent: row.minutesSpent as number | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function todoLogToRow(log: Partial<TodoLog>): InferInsertModel<typeof todoLogs> {
  const row: Record<string, unknown> = {};
  if (log.id !== undefined) row.id = log.id;
  if (log.todoId !== undefined) row.todoId = log.todoId;
  if (log.type !== undefined) row.type = log.type;
  if (log.content !== undefined) row.content = log.content;
  if (log.minutesSpent !== undefined) row.minutesSpent = log.minutesSpent;
  if (log.metadata !== undefined) row.metadata = log.metadata;
  Object.assign(row, objToHlcColumns(log.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(log.updatedAt, 'updatedAt'));
  if (log.isDeleted !== undefined) row.isDeleted = log.isDeleted;
  return row as InferInsertModel<typeof todoLogs>;
}

export function rowToActionEdge(row: Record<string, unknown>): ActionEdge {
  return {
    id: row.id as string,
    fromTodoId: row.fromTodoId as string,
    toTodoId: row.toTodoId as string,
    type: row.type as ActionEdgeType,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function actionEdgeToRow(edge: Partial<ActionEdge>): InferInsertModel<typeof actionEdges> {
  const row: Record<string, unknown> = {};
  if (edge.id !== undefined) row.id = edge.id;
  if (edge.fromTodoId !== undefined) row.fromTodoId = edge.fromTodoId;
  if (edge.toTodoId !== undefined) row.toTodoId = edge.toTodoId;
  if (edge.type !== undefined) row.type = edge.type;
  Object.assign(row, objToHlcColumns(edge.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(edge.updatedAt, 'updatedAt'));
  if (edge.isDeleted !== undefined) row.isDeleted = edge.isDeleted;
  return row as InferInsertModel<typeof actionEdges>;
}

export function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id: row.id as string,
    goalTodoId: row.goalTodoId as string,
    title: row.title as string,
    nodeIds: (row.nodeIds as string[]) ?? [],
    edgeIds: (row.edgeIds as string[]) ?? [],
    isSystemPlan: row.isSystemPlan as boolean | undefined,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function planToRow(plan: Partial<Plan>): InferInsertModel<typeof plans> {
  const row: Record<string, unknown> = {};
  if (plan.id !== undefined) row.id = plan.id;
  if (plan.goalTodoId !== undefined) row.goalTodoId = plan.goalTodoId;
  if (plan.title !== undefined) row.title = plan.title;
  if (plan.nodeIds !== undefined) row.nodeIds = plan.nodeIds;
  if (plan.edgeIds !== undefined) row.edgeIds = plan.edgeIds;
  if (plan.isSystemPlan !== undefined) row.isSystemPlan = plan.isSystemPlan;
  Object.assign(row, objToHlcColumns(plan.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(plan.updatedAt, 'updatedAt'));
  if (plan.isDeleted !== undefined) row.isDeleted = plan.isDeleted;
  return row as InferInsertModel<typeof plans>;
}

export function rowToPluse(row: Record<string, unknown>): Pluse {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    intervals: (row.intervals as number[]) ?? [1500],
    repeatCount: (row.repeatCount as number) ?? 1,
    intervalTodos: row.intervalTodos as Record<number, string> | undefined,
    autoAdvance: (row.autoAdvance as boolean) ?? true,
    timerStatus: (row.timerStatus as Pluse['timerStatus']) ?? 'idle',
    currentIntervalIndex: (row.currentIntervalIndex as number) ?? 0,
    startedAt: timestampToDate(row.startedAt),
    accumulatedSeconds: (row.accumulatedSeconds as number) ?? 0,
    isActive: (row.isActive as boolean) ?? false,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function pluseToRow(pluse: Partial<Pluse>): InferInsertModel<typeof pluses> {
  const row: Record<string, unknown> = {};
  if (pluse.id !== undefined) row.id = pluse.id;
  if (pluse.name !== undefined) row.name = pluse.name;
  if (pluse.description !== undefined) row.description = pluse.description;
  if (pluse.intervals !== undefined) row.intervals = pluse.intervals;
  if (pluse.repeatCount !== undefined) row.repeatCount = pluse.repeatCount;
  if (pluse.intervalTodos !== undefined) row.intervalTodos = pluse.intervalTodos;
  if (pluse.autoAdvance !== undefined) row.autoAdvance = pluse.autoAdvance;
  if (pluse.timerStatus !== undefined) row.timerStatus = pluse.timerStatus;
  if (pluse.currentIntervalIndex !== undefined) row.currentIntervalIndex = pluse.currentIntervalIndex;
  if (pluse.startedAt !== undefined) row.startedAt = pluse.startedAt ? pluse.startedAt.getTime() : null;
  if (pluse.accumulatedSeconds !== undefined) row.accumulatedSeconds = pluse.accumulatedSeconds;
  if (pluse.isActive !== undefined) row.isActive = pluse.isActive;
  Object.assign(row, objToHlcColumns(pluse.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(pluse.updatedAt, 'updatedAt'));
  if (pluse.isDeleted !== undefined) row.isDeleted = pluse.isDeleted;
  return row as InferInsertModel<typeof pluses>;
}

export function rowToRepeatOccurrence(row: Record<string, unknown>): RepeatOccurrence {
  return {
    id: row.id as string,
    templateId: row.templateId as string,
    date: timestampToDate(row.date)!,
    status: row.status as TodoStatus | undefined,
    completedAt: timestampToDate(row.completedAt),
    materializedTodoId: row.materializedTodoId as string | undefined,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function repeatOccurrenceToRow(occ: Partial<RepeatOccurrence>): InferInsertModel<typeof repeatOccurrences> {
  const row: Record<string, unknown> = {};
  if (occ.id !== undefined) row.id = occ.id;
  if (occ.templateId !== undefined) row.templateId = occ.templateId;
  if (occ.date !== undefined) row.date = occ.date ? occ.date.getTime() : null;
  if (occ.status !== undefined) row.status = occ.status;
  if (occ.completedAt !== undefined) row.completedAt = occ.completedAt ? occ.completedAt.getTime() : null;
  if (occ.materializedTodoId !== undefined) row.materializedTodoId = occ.materializedTodoId;
  Object.assign(row, objToHlcColumns(occ.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(occ.updatedAt, 'updatedAt'));
  if (occ.isDeleted !== undefined) row.isDeleted = occ.isDeleted;
  return row as InferInsertModel<typeof repeatOccurrences>;
}

export function rowToTimerSession(row: Record<string, unknown>): TimerSession {
  return {
    id: row.id as string,
    type: row.type as 'stopwatch' | 'pluse',
    name: row.name as string,
    pluseId: row.pluseId as string | undefined,
    todoId: row.todoId as string | undefined,
    intervals: row.intervals as number[] | undefined,
    repeatCount: row.repeatCount as number | undefined,
    currentIndex: (row.currentIndex as number) ?? 0,
    elapsedSeconds: (row.elapsedSeconds as number) ?? 0,
    status: row.status as 'running' | 'paused' | 'completed',
    startedAt: timestampToDate(row.startedAt),
    pausedAt: timestampToDate(row.pausedAt),
    completedAt: timestampToDate(row.completedAt),
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function timerSessionToRow(session: Partial<TimerSession>): InferInsertModel<typeof timerSessions> {
  const row: Record<string, unknown> = {};
  if (session.id !== undefined) row.id = session.id;
  if (session.type !== undefined) row.type = session.type;
  if (session.name !== undefined) row.name = session.name;
  if (session.pluseId !== undefined) row.pluse_id = session.pluseId;
  if (session.todoId !== undefined) row.todo_id = session.todoId;
  if (session.intervals !== undefined) row.intervals = session.intervals;
  if (session.repeatCount !== undefined) row.repeat_count = session.repeatCount;
  if (session.currentIndex !== undefined) row.current_index = session.currentIndex;
  if (session.elapsedSeconds !== undefined) row.elapsed_seconds = session.elapsedSeconds;
  if (session.status !== undefined) row.status = session.status;
  if (session.startedAt !== undefined) row.started_at = session.startedAt ? session.startedAt.getTime() : null;
  if (session.pausedAt !== undefined) row.paused_at = session.pausedAt ? session.pausedAt.getTime() : null;
  if (session.completedAt !== undefined) row.completed_at = session.completedAt ? session.completedAt.getTime() : null;
  Object.assign(row, objToHlcColumns(session.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(session.updatedAt, 'updated_at'));
  if (session.isDeleted !== undefined) row.is_deleted = session.isDeleted;
  return row as InferInsertModel<typeof timerSessions>;
}

export function rowToTimeSlotDefinition(row: Record<string, unknown>): TimeSlotDefinition {
  return {
    id: row.id as string,
    milestoneId: row.milestoneId as string,
    title: row.title as string,
    time: row.time as string,
    startHour: (row.startHour as number) ?? 0,
    startMinute: (row.startMinute as number) ?? 0,
    endHour: (row.endHour as number) ?? 0,
    endMinute: (row.endMinute as number) ?? 0,
    order: (row.order as number) ?? 0,
    createdAt: hlcDateToObj(row, 'createdAt')!,
    updatedAt: hlcDateToObj(row, 'updatedAt')!,
    isDeleted: (row.isDeleted as boolean) ?? false,
  };
}

export function timeSlotDefinitionToRow(
  slot: Partial<TimeSlotDefinition>
): InferInsertModel<typeof timeSlots> {
  const row: Record<string, unknown> = {};
  if (slot.id !== undefined) row.id = slot.id;
  if (slot.milestoneId !== undefined) row.milestoneId = slot.milestoneId;
  if (slot.title !== undefined) row.title = slot.title;
  if (slot.time !== undefined) row.time = slot.time;
  if (slot.startHour !== undefined) row.startHour = slot.startHour;
  if (slot.startMinute !== undefined) row.startMinute = slot.startMinute;
  if (slot.endHour !== undefined) row.endHour = slot.endHour;
  if (slot.endMinute !== undefined) row.endMinute = slot.endMinute;
  if (slot.order !== undefined) row.order = slot.order;
  Object.assign(row, objToHlcColumns(slot.createdAt, 'createdAt'));
  Object.assign(row, objToHlcColumns(slot.updatedAt, 'updatedAt'));
  if (slot.isDeleted !== undefined) row.isDeleted = slot.isDeleted;
  return row as InferInsertModel<typeof timeSlots>;
}
