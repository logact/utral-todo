import type { InferInsertModel } from 'drizzle-orm';
import type {
  Todo,
  TodoRelation,
  TodoLog,
  ActionEdge,
  Plan,
  Pluse,
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
} from '@utral/types';
import {
  todos,
  todoRelations,
  todoLogs,
  actionEdges,
  plans,
  pluses,
  repeatOccurrences,
  timeSlots,
} from './schema.js';

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

function timestampToDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value * 1000); // SQLite stores seconds
  return undefined;
}

// ─── Row → entity ───

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
  const row = {} as InferInsertModel<typeof todos>;
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
  if (todo.targetDate !== undefined) row.targetDate = todo.targetDate ? todo.targetDate : null;
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
