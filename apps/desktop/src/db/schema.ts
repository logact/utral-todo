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
};

// ─── HLC column helpers ───

function hlcDateToObj(row: Record<string, unknown>, prefix: string) {
  const wall = row[`${prefix}_wall`] as number | null;
  const counter = row[`${prefix}_counter`] as number | undefined;
  const node = row[`${prefix}_node`] as string | null;
  if (wall == null) return undefined;
  return { wall, counter: counter ?? 0, node: node ?? '' };
}

function objToHlcColumns(obj: unknown, prefix: string) {
  const hlc = obj as { wall?: number; counter?: number; node?: string } | undefined | null;
  if (!hlc) return {};
  return {
    [`${prefix}_wall`]: hlc.wall ?? null,
    [`${prefix}_counter`]: hlc.counter ?? 0,
    [`${prefix}_node`]: hlc.node ?? null,
  };
}

// ─── Drizzle Schema ───

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  nodeType: text('node_type', { enum: ['goal', 'task'] }).notNull().default('task'),
  pattern: text('pattern', { enum: ['task', 'cognitive'] }),
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

export function rowToTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as string,
    nodeType: row.node_type as NodeType,
    pattern: row.pattern as TaskPattern | undefined,
    title: row.title as string,
    description: row.description as string,
    status: row.status as TodoStatus | undefined,
    priority: row.priority as Priority | undefined,
    goalStatus: row.goal_status as GoalStatus | undefined,
    estimatedMinutes: row.estimated_minutes as number | undefined,
    scheduledDate: row.scheduled_date as Date | undefined,
    scheduledEndDate: row.scheduled_end_date as Date | undefined,
    dueDate: row.due_date as Date | undefined,
    startedAt: row.started_at as Date | undefined,
    completedAt: row.completed_at as Date | undefined,
    parentId: row.parent_id as string | undefined,
    activePlanId: row.active_plan_id as string | undefined,
    isRootGoal: row.is_root_goal as boolean | undefined,
    isSystemTask: row.is_system_task as boolean | undefined,
    motivation: row.motivation as string | undefined,
    successCriteria: row.success_criteria as string | undefined,
    targetDate: row.target_date as Date | undefined,
    repeatRule: row.repeat_rule as RepeatRule | undefined,
    tags: (row.tags as string[]) ?? [],
    order: (row.order as number) ?? 0,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function todoToRow(todo: Partial<Todo>): InferInsertModel<typeof todos> {
  const row: Record<string, unknown> = {};
  if (todo.id !== undefined) row.id = todo.id;
  if (todo.nodeType !== undefined) row.node_type = todo.nodeType;
  if (todo.pattern !== undefined) row.pattern = todo.pattern;
  if (todo.title !== undefined) row.title = todo.title;
  if (todo.description !== undefined) row.description = todo.description;
  if (todo.status !== undefined) row.status = todo.status;
  if (todo.priority !== undefined) row.priority = todo.priority;
  if (todo.goalStatus !== undefined) row.goal_status = todo.goalStatus;
  if (todo.estimatedMinutes !== undefined) row.estimated_minutes = todo.estimatedMinutes;
  if (todo.scheduledDate !== undefined) row.scheduled_date = todo.scheduledDate;
  if (todo.scheduledEndDate !== undefined) row.scheduled_end_date = todo.scheduledEndDate;
  if (todo.dueDate !== undefined) row.due_date = todo.dueDate;
  if (todo.startedAt !== undefined) row.started_at = todo.startedAt;
  if (todo.completedAt !== undefined) row.completed_at = todo.completedAt;
  if (todo.parentId !== undefined) row.parent_id = todo.parentId;
  if (todo.activePlanId !== undefined) row.active_plan_id = todo.activePlanId;
  if (todo.isRootGoal !== undefined) row.is_root_goal = todo.isRootGoal;
  if (todo.isSystemTask !== undefined) row.is_system_task = todo.isSystemTask;
  if (todo.motivation !== undefined) row.motivation = todo.motivation;
  if (todo.successCriteria !== undefined) row.success_criteria = todo.successCriteria;
  if (todo.targetDate !== undefined) row.target_date = todo.targetDate;
  if (todo.repeatRule !== undefined) row.repeat_rule = todo.repeatRule;
  if (todo.tags !== undefined) row.tags = todo.tags;
  if (todo.order !== undefined) row.order = todo.order;
  Object.assign(row, objToHlcColumns(todo.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(todo.updatedAt, 'updated_at'));
  if (todo.isDeleted !== undefined) row.is_deleted = todo.isDeleted;
  return row as InferInsertModel<typeof todos>;
}

export function rowToRelation(row: Record<string, unknown>): TodoRelation {
  return {
    id: row.id as string,
    fromTodoId: row.from_todo_id as string,
    toTodoId: row.to_todo_id as string,
    type: row.type as TodoRelationType,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function relationToRow(relation: Partial<TodoRelation>): InferInsertModel<typeof todoRelations> {
  const row: Record<string, unknown> = {};
  if (relation.id !== undefined) row.id = relation.id;
  if (relation.fromTodoId !== undefined) row.from_todo_id = relation.fromTodoId;
  if (relation.toTodoId !== undefined) row.to_todo_id = relation.toTodoId;
  if (relation.type !== undefined) row.type = relation.type;
  Object.assign(row, objToHlcColumns(relation.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(relation.updatedAt, 'updated_at'));
  if (relation.isDeleted !== undefined) row.is_deleted = relation.isDeleted;
  return row as InferInsertModel<typeof todoRelations>;
}

export function rowToTodoLog(row: Record<string, unknown>): TodoLog {
  return {
    id: row.id as string,
    todoId: row.todo_id as string,
    type: row.type as TodoLogType,
    content: row.content as string,
    minutesSpent: row.minutes_spent as number | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function todoLogToRow(log: Partial<TodoLog>): InferInsertModel<typeof todoLogs> {
  const row: Record<string, unknown> = {};
  if (log.id !== undefined) row.id = log.id;
  if (log.todoId !== undefined) row.todo_id = log.todoId;
  if (log.type !== undefined) row.type = log.type;
  if (log.content !== undefined) row.content = log.content;
  if (log.minutesSpent !== undefined) row.minutes_spent = log.minutesSpent;
  if (log.metadata !== undefined) row.metadata = log.metadata;
  Object.assign(row, objToHlcColumns(log.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(log.updatedAt, 'updated_at'));
  if (log.isDeleted !== undefined) row.is_deleted = log.isDeleted;
  return row as InferInsertModel<typeof todoLogs>;
}

export function rowToActionEdge(row: Record<string, unknown>): ActionEdge {
  return {
    id: row.id as string,
    fromTodoId: row.from_todo_id as string,
    toTodoId: row.to_todo_id as string,
    type: row.type as ActionEdgeType,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function actionEdgeToRow(edge: Partial<ActionEdge>): InferInsertModel<typeof actionEdges> {
  const row: Record<string, unknown> = {};
  if (edge.id !== undefined) row.id = edge.id;
  if (edge.fromTodoId !== undefined) row.from_todo_id = edge.fromTodoId;
  if (edge.toTodoId !== undefined) row.to_todo_id = edge.toTodoId;
  if (edge.type !== undefined) row.type = edge.type;
  Object.assign(row, objToHlcColumns(edge.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(edge.updatedAt, 'updated_at'));
  if (edge.isDeleted !== undefined) row.is_deleted = edge.isDeleted;
  return row as InferInsertModel<typeof actionEdges>;
}

export function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id: row.id as string,
    goalTodoId: row.goal_todo_id as string,
    title: row.title as string,
    nodeIds: (row.node_ids as string[]) ?? [],
    edgeIds: (row.edge_ids as string[]) ?? [],
    isSystemPlan: row.is_system_plan as boolean | undefined,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function planToRow(plan: Partial<Plan>): InferInsertModel<typeof plans> {
  const row: Record<string, unknown> = {};
  if (plan.id !== undefined) row.id = plan.id;
  if (plan.goalTodoId !== undefined) row.goal_todo_id = plan.goalTodoId;
  if (plan.title !== undefined) row.title = plan.title;
  if (plan.nodeIds !== undefined) row.node_ids = plan.nodeIds;
  if (plan.edgeIds !== undefined) row.edge_ids = plan.edgeIds;
  if (plan.isSystemPlan !== undefined) row.is_system_plan = plan.isSystemPlan;
  Object.assign(row, objToHlcColumns(plan.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(plan.updatedAt, 'updated_at'));
  if (plan.isDeleted !== undefined) row.is_deleted = plan.isDeleted;
  return row as InferInsertModel<typeof plans>;
}

export function rowToPluse(row: Record<string, unknown>): Pluse {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    intervals: (row.intervals as number[]) ?? [1500],
    repeatCount: (row.repeat_count as number) ?? 1,
    intervalTodos: row.interval_todos as Record<number, string> | undefined,
    autoAdvance: (row.auto_advance as boolean) ?? true,
    timerStatus: (row.timer_status as Pluse['timerStatus']) ?? 'idle',
    currentIntervalIndex: (row.current_interval_index as number) ?? 0,
    startedAt: row.started_at as Date | undefined,
    accumulatedSeconds: (row.accumulated_seconds as number) ?? 0,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function pluseToRow(pluse: Partial<Pluse>): InferInsertModel<typeof pluses> {
  const row: Record<string, unknown> = {};
  if (pluse.id !== undefined) row.id = pluse.id;
  if (pluse.name !== undefined) row.name = pluse.name;
  if (pluse.description !== undefined) row.description = pluse.description;
  if (pluse.intervals !== undefined) row.intervals = pluse.intervals;
  if (pluse.repeatCount !== undefined) row.repeat_count = pluse.repeatCount;
  if (pluse.intervalTodos !== undefined) row.interval_todos = pluse.intervalTodos;
  if (pluse.autoAdvance !== undefined) row.auto_advance = pluse.autoAdvance;
  if (pluse.timerStatus !== undefined) row.timer_status = pluse.timerStatus;
  if (pluse.currentIntervalIndex !== undefined) row.current_interval_index = pluse.currentIntervalIndex;
  if (pluse.startedAt !== undefined) row.started_at = pluse.startedAt;
  if (pluse.accumulatedSeconds !== undefined) row.accumulated_seconds = pluse.accumulatedSeconds;
  Object.assign(row, objToHlcColumns(pluse.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(pluse.updatedAt, 'updated_at'));
  if (pluse.isDeleted !== undefined) row.is_deleted = pluse.isDeleted;
  return row as InferInsertModel<typeof pluses>;
}

export function rowToRepeatOccurrence(row: Record<string, unknown>): RepeatOccurrence {
  return {
    id: row.id as string,
    templateId: row.template_id as string,
    date: row.date as Date,
    status: row.status as TodoStatus | undefined,
    completedAt: row.completed_at as Date | undefined,
    materializedTodoId: row.materialized_todo_id as string | undefined,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
  };
}

export function repeatOccurrenceToRow(occ: Partial<RepeatOccurrence>): InferInsertModel<typeof repeatOccurrences> {
  const row: Record<string, unknown> = {};
  if (occ.id !== undefined) row.id = occ.id;
  if (occ.templateId !== undefined) row.template_id = occ.templateId;
  if (occ.date !== undefined) row.date = occ.date;
  if (occ.status !== undefined) row.status = occ.status;
  if (occ.completedAt !== undefined) row.completed_at = occ.completedAt;
  if (occ.materializedTodoId !== undefined) row.materialized_todo_id = occ.materializedTodoId;
  Object.assign(row, objToHlcColumns(occ.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(occ.updatedAt, 'updated_at'));
  if (occ.isDeleted !== undefined) row.is_deleted = occ.isDeleted;
  return row as InferInsertModel<typeof repeatOccurrences>;
}

export function rowToTimerSession(row: Record<string, unknown>): TimerSession {
  return {
    id: row.id as string,
    type: row.type as 'stopwatch' | 'pluse',
    name: row.name as string,
    pluseId: row.pluse_id as string | undefined,
    todoId: row.todo_id as string | undefined,
    intervals: row.intervals as number[] | undefined,
    repeatCount: row.repeat_count as number | undefined,
    currentIndex: (row.current_index as number) ?? 0,
    elapsedSeconds: (row.elapsed_seconds as number) ?? 0,
    status: row.status as 'running' | 'paused' | 'completed',
    startedAt: row.started_at as Date | undefined,
    pausedAt: row.paused_at as Date | undefined,
    completedAt: row.completed_at as Date | undefined,
    createdAt: hlcDateToObj(row, 'created_at')!,
    updatedAt: hlcDateToObj(row, 'updated_at')!,
    isDeleted: (row.is_deleted as boolean) ?? false,
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
  if (session.startedAt !== undefined) row.started_at = session.startedAt;
  if (session.pausedAt !== undefined) row.paused_at = session.pausedAt;
  if (session.completedAt !== undefined) row.completed_at = session.completedAt;
  Object.assign(row, objToHlcColumns(session.createdAt, 'created_at'));
  Object.assign(row, objToHlcColumns(session.updatedAt, 'updated_at'));
  if (session.isDeleted !== undefined) row.is_deleted = session.isDeleted;
  return row as InferInsertModel<typeof timerSessions>;
}
