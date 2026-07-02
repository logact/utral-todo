import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Todo ────────────────────────────────────────────────────────────────────

export const todo = pgTable('Todo', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeType: text('nodeType').notNull().default('task'),
  pattern: text('pattern').notNull().default('task'), // 'task' | 'cognitive' | 'timeSlot'
  parentId: uuid('parentId'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status'),
  priority: text('priority'),
  estimatedMinutes: integer('estimatedMinutes'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  dueDate: timestamp('dueDate'),
  scheduledDate: timestamp('scheduledDate'),
  scheduledEndDate: timestamp('scheduledEndDate'),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
  repeatRule: jsonb('repeatRule'),
  order: integer('order').notNull().default(0),
  motivation: text('motivation'),
  successCriteria: text('successCriteria'),
  targetDate: timestamp('targetDate'),
  goalStatus: text('goalStatus'),
  activePlanId: text('activePlanId'),
  isRootGoal: boolean('isRootGoal').default(false),
  isSystemTask: boolean('isSystemTask').default(false),
  // HLC CRDT fields
  versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
  versionCounter: integer('versionCounter').notNull().default(0),
  versionNode: text('versionNode').notNull().default(''),
  isDeleted: boolean('isDeleted').notNull().default(false),
});

export const todoRelations = relations(todo, ({ one, many }) => ({
  parent: one(todo, {
    fields: [todo.parentId],
    references: [todo.id],
    relationName: 'TodoChildren',
  }),
  children: many(todo, { relationName: 'TodoChildren' }),
  outgoingRelations: many(todoRelation, { relationName: 'FromTodo' }),
  incomingRelations: many(todoRelation, { relationName: 'ToTodo' }),
  logs: many(todoLog),
}));

// ── TodoRelation ────────────────────────────────────────────────────────────

export const todoRelation = pgTable('TodoRelation', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromTodoId: uuid('fromTodoId').notNull(),
  toTodoId: uuid('toTodoId').notNull(),
  type: text('type').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  // HLC CRDT fields
  versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
  versionCounter: integer('versionCounter').notNull().default(0),
  versionNode: text('versionNode').notNull().default(''),
  isDeleted: boolean('isDeleted').notNull().default(false),
});

export const todoRelationRelations = relations(todoRelation, ({ one }) => ({
  fromTodo: one(todo, {
    fields: [todoRelation.fromTodoId],
    references: [todo.id],
    relationName: 'FromTodo',
  }),
  toTodo: one(todo, {
    fields: [todoRelation.toTodoId],
    references: [todo.id],
    relationName: 'ToTodo',
  }),
}));

// ── TodoLog ─────────────────────────────────────────────────────────────────

export const todoLog = pgTable('TodoLog', {
  id: uuid('id').primaryKey().defaultRandom(),
  todoId: uuid('todoId').notNull(),
  type: text('type').notNull(),
  content: text('content').notNull(),
  minutesSpent: integer('minutesSpent'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  // HLC CRDT fields
  versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
  versionCounter: integer('versionCounter').notNull().default(0),
  versionNode: text('versionNode').notNull().default(''),
  isDeleted: boolean('isDeleted').notNull().default(false),
});

export const todoLogRelations = relations(todoLog, ({ one }) => ({
  todo: one(todo, {
    fields: [todoLog.todoId],
    references: [todo.id],
  }),
}));

// ── Plan ────────────────────────────────────────────────────────────────────

export const plan = pgTable(
  'Plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalTodoId: text('goalTodoId').notNull(),
    title: text('title').notNull(),
    nodeIds: jsonb('nodeIds').$type<string[]>().notNull(),
    edgeIds: jsonb('edgeIds').$type<string[]>().notNull(),
    isSystemPlan: boolean('isSystemPlan').default(false),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    // HLC CRDT fields
    versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
    versionCounter: integer('versionCounter').notNull().default(0),
    versionNode: text('versionNode').notNull().default(''),
    isDeleted: boolean('isDeleted').notNull().default(false),
  },
  (t) => [index('Plan_goalTodoId_idx').on(t.goalTodoId)],
);

// ── ActionEdge ──────────────────────────────────────────────────────────────

export const actionEdge = pgTable('ActionEdge', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromTodoId: text('fromTodoId').notNull(),
  toTodoId: text('toTodoId').notNull(),
  type: text('type').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  // HLC CRDT fields
  versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
  versionCounter: integer('versionCounter').notNull().default(0),
  versionNode: text('versionNode').notNull().default(''),
  isDeleted: boolean('isDeleted').notNull().default(false),
});

// ── Pluse ───────────────────────────────────────────────────────────────────

export const pluse = pgTable('Pluse', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  intervals: jsonb('intervals').notNull(),
  repeatCount: integer('repeatCount').notNull().default(1),
  intervalTodos: jsonb('intervalTodos'),
  autoAdvance: boolean('autoAdvance').notNull().default(true),
  timerStatus: text('timerStatus').notNull().default('idle'),
  currentIntervalIndex: integer('currentIntervalIndex').notNull().default(0),
  startedAt: timestamp('startedAt'),
  accumulatedSeconds: integer('accumulatedSeconds').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  // HLC CRDT fields
  versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
  versionCounter: integer('versionCounter').notNull().default(0),
  versionNode: text('versionNode').notNull().default(''),
  isDeleted: boolean('isDeleted').notNull().default(false),
});

// ── RepeatOccurrence ────────────────────────────────────────────────────────

export const repeatOccurrence = pgTable(
  'RepeatOccurrence',
  {
    id: text('id').primaryKey(),
    templateId: text('templateId').notNull(),
    date: timestamp('date').notNull(),
    status: text('status').notNull(),
    completedAt: timestamp('completedAt'),
    materializedTodoId: text('materializedTodoId'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    // HLC CRDT fields
    versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
    versionCounter: integer('versionCounter').notNull().default(0),
    versionNode: text('versionNode').notNull().default(''),
    isDeleted: boolean('isDeleted').notNull().default(false),
  },
  (t) => [
    index('RepeatOccurrence_templateId_idx').on(t.templateId),
    index('RepeatOccurrence_date_idx').on(t.date),
  ],
);

// ── TimeSlot ────────────────────────────────────────────────────────────────

export const timeSlot = pgTable(
  'TimeSlot',
  {
    id: text('id').primaryKey(),
    milestoneId: text('milestoneId').notNull(),
    title: text('title').notNull(),
    time: text('time').notNull(),
    startHour: integer('startHour').notNull(),
    startMinute: integer('startMinute').notNull(),
    endHour: integer('endHour').notNull(),
    endMinute: integer('endMinute').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    // HLC CRDT fields
    versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
    versionCounter: integer('versionCounter').notNull().default(0),
    versionNode: text('versionNode').notNull().default(''),
    isDeleted: boolean('isDeleted').notNull().default(false),
  },
  (t) => [index('TimeSlot_milestoneId_idx').on(t.milestoneId)],
);

// ── SyncEvent ───────────────────────────────────────────────────────────────

export const syncEvent = pgTable(
  'SyncEvent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    table: text('table').notNull(),
    operation: text('operation').notNull(),
    recordId: text('recordId').notNull(),
    payload: jsonb('payload'),
    deviceId: text('deviceId').notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull().default(0),
    channel: text('channel').notNull().default(''),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    versionWall: bigint('versionWall', { mode: 'number' }).notNull().default(0),
    versionCounter: integer('versionCounter').notNull().default(0),
    versionNode: text('versionNode').notNull().default(''),
  },
  (t) => [
    index('SyncEvent_createdAt_idx').on(t.createdAt),
    index('SyncEvent_recordId_idx').on(t.recordId),
    index('SyncEvent_channel_seq_idx').on(t.channel, t.seq),
  ],
);

// ── Device ──────────────────────────────────────────────────────────────────

export const device = pgTable(
  'Device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: text('deviceId').notNull(),
    platform: text('platform').notNull(),
    name: text('name'),
    pushToken: text('pushToken'),
    appVersion: text('appVersion'),
    lastSeenAt: timestamp('lastSeenAt').notNull().defaultNow(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('Device_deviceId_key').on(t.deviceId),
    index('Device_platform_idx').on(t.platform),
    index('Device_pushToken_idx').on(t.pushToken),
  ],
);
