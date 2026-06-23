import type { HLCTimestamp } from './hlc.js';
export type { HLCTimestamp } from './hlc.js';
export { newHLC, mergeHLC, compareHLC, maxHLC, hlcToDate, dateToHLC, hlcToString, stringToHLC } from './hlc.js';

export type TodoStatus = 'pending' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type TodoLogType = 'progress' | 'thought' | 'blocker' | 'decision' | 'system' | 'step_complete' | 'exec';

export type NodeType = 'goal' | 'task';
export type TaskPattern = 'task' | 'cognitive';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';

export type ActionEdgeType = 'pre_do' | 'parent_child' | 'to_achieve';

// Legacy action-edge types are preserved only for rendering old data.
// New edges should use one of the semantic ActionEdgeType values above.
export type ActionEdgeTypeLegacy = 'insight' | 'try';

export type ActionEdgeTypeAll = ActionEdgeType | ActionEdgeTypeLegacy;

export interface ActionEdge {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: ActionEdgeTypeAll;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface Plan {
  id: string;
  goalTodoId: string;
  title: string;
  nodeIds: string[];
  edgeIds: string[];
  isSystemPlan?: boolean;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

// Road-to-goal relation types:
//   parent_of      : goal -> goal (parent goal to child goal)
//   achieves       : task -> goal (task contributes to / achieves a goal)
//   ordered_before : goal -> goal or task -> task (sequential order)
// Legacy / general:
//   depends_on     : task -> task (dependency)
//   blocked_by     : task -> task (blocker)
//   source_from    : deprecated, replaced by parent_of for goals
//   assign_from    : template -> instance (recurring task assignment)
export type TodoRelationType =
  | 'depends_on'
  | 'blocked_by'
  | 'parent_of'
  | 'source_from'
  | 'assign_from'
  | 'achieves'
  | 'ordered_before';

export interface TodoRelation {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: TodoRelationType;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface RepeatRule {
  type: 'daily' | 'weekly' | 'every_n_days';
  weekDays?: number[];
  interval?: number;
  endDate?: Date;
}

export interface RepeatOccurrence {
  id: string;
  templateId: string;
  date: Date;
  status: TodoStatus;
  completedAt?: Date;
  materializedTodoId?: string;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface TodoBase {
  id: string;
  nodeType: NodeType;
  pattern?: TaskPattern;
  title: string;
  description: string;
  parentId?: string;
  activePlanId?: string;
  isRootGoal?: boolean;
  isSystemTask?: boolean;
  tags: string[];
  order: number;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface Goal extends TodoBase {
  nodeType: 'goal';
  motivation?: string;
  successCriteria?: string;
  targetDate?: Date;
  goalStatus: GoalStatus;
}

export interface Task extends TodoBase {
  nodeType: 'task';
  status: TodoStatus;
  priority: Priority;
  estimatedMinutes: number;
  scheduledDate?: Date;
  scheduledEndDate?: Date;
  dueDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  repeatRule?: RepeatRule;
}

export interface Todo extends TodoBase {
  // Goal fields
  motivation?: string;
  successCriteria?: string;
  targetDate?: Date;
  goalStatus?: GoalStatus;
  // Task fields
  status?: TodoStatus;
  priority?: Priority;
  estimatedMinutes?: number;
  scheduledDate?: Date;
  scheduledEndDate?: Date;
  dueDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  repeatRule?: RepeatRule;
}

export function isGoal(todo: Todo): todo is Goal {
  return todo.nodeType === 'goal';
}

export function isTask(todo: Todo): todo is Task {
  return todo.nodeType === 'task';
}

export interface TodoLog {
  id: string;
  todoId: string;
  type: TodoLogType;
  content: string;
  minutesSpent?: number;
  metadata?: Record<string, unknown>;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface Pluse {
  id: string;
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  intervalTodos?: Record<number, string>;
  autoAdvance?: boolean;
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface TimerSession {
  id: string;
  type: 'stopwatch' | 'pluse';
  name: string;
  pluseId?: string;
  todoId?: string;
  intervals?: number[];
  repeatCount: number;
  startedAt: Date;
  pausedAt?: Date;
  completedAt?: Date;
  currentIndex: number;
  elapsedSeconds: number;
  status: 'running' | 'paused' | 'completed';
  createdAt: HLCTimestamp;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
}

export interface SyncPayload {
  todos?: Todo[];
  relations?: TodoRelation[];
  todoLogs?: TodoLog[];
  actionEdges?: ActionEdge[];
  plans?: Plan[];
  pluses?: Pluse[];
  timerSessions?: TimerSession[];
  repeatOccurrences?: RepeatOccurrence[];
  labels?: Label[];
}

export interface SyncEvent {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;
  deviceId: string;
  createdAt: HLCTimestamp;
}

export interface SyncConfig {
  serverUrl: string;
  apiToken?: string;
  remoteOpsEnabled?: boolean;
}

export interface SyncResult {
  success: boolean;
  pulled: {
    todos: number;
    relations: number;
    todoLogs: number;
    actionEdges: number;
    plans: number;
    pluses: number;
    timerSessions: number;
    labels: number;
  };
  pushed: {
    todos: number;
    relations: number;
    todoLogs: number;
    actionEdges: number;
    plans: number;
    pluses: number;
    timerSessions: number;
    labels: number;
  };
  error?: string;
}

export type DevicePlatform = 'ios' | 'watchos' | 'desktop';

export interface Device {
  id: string;
  deviceId: string;
  platform: DevicePlatform;
  name?: string;
  pushToken?: string;
  appVersion?: string;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface Label {
  name: string;
  count: number;
}

export interface WatchTodo {
  id: string;
  title: string;
  status: TodoStatus;
  projectColor: string;
  estimatedMinutes: number;
}

export interface WatchTodayResponse {
  todos: WatchTodo[];
}

export interface ApnsPayload {
  aps: {
    'content-available'?: number;
    alert?: {
      title?: string;
      body?: string;
    };
    badge?: number;
    sound?: string;
  };
  table?: string;
  operation?: string;
  recordId?: string;
}

export {
  formatDateKey,
  makeVirtualTodoId,
  isVirtualTodoId,
  parseVirtualTodoId,
  dateMatchesRule,
  getDatesForRule,
  computeVirtualTodo,
} from './repeat.js';
