import type { HLC } from './hlc.js';
import type {
  TodoStatus,
  Priority,
  NodeType,
  TaskPattern,
  GoalStatus,
  TodoRelationType,
  TodoLogType,
  ActionEdgeType,
  PluseTimerStatus,
} from './enums.js';

export interface RepeatRule {
  type: 'daily' | 'weekly' | 'every_n_days';
  weekDays?: number[];
  interval?: number;
  endDate?: Date;
}

export interface Todo {
  id: string;
  nodeType: NodeType;
  pattern?: TaskPattern;
  title: string;
  description: string;
  status?: TodoStatus;
  priority?: Priority;
  goalStatus?: GoalStatus;
  estimatedMinutes?: number;
  scheduledDate?: Date;
  scheduledEndDate?: Date;
  dueDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  parentId?: string;
  activePlanId?: string;
  isRootGoal?: boolean;
  isSystemTask?: boolean;
  motivation?: string;
  successCriteria?: string;
  targetDate?: Date;
  repeatRule?: RepeatRule;
  tags: string[];
  order: number;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
}

export interface RepeatOccurrence {
  id: string;
  templateId: string;
  date: Date;
  status?: TodoStatus;
  completedAt?: Date;
  materializedTodoId?: string;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
}

export interface TodoRelation {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: TodoRelationType;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
}

export interface TodoLog {
  id: string;
  todoId: string;
  type: TodoLogType;
  content: string;
  minutesSpent?: number;
  metadata?: Record<string, unknown>;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
}

export interface ActionEdge {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: ActionEdgeType;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
}

export interface Plan {
  id: string;
  goalTodoId: string;
  title: string;
  nodeIds: string[];
  edgeIds: string[];
  isSystemPlan?: boolean;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
}

export interface Pluse {
  id: string;
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  intervalTodos?: Record<number, string>;
  autoAdvance: boolean;
  timerStatus: PluseTimerStatus;
  currentIntervalIndex: number;
  startedAt?: Date;
  accumulatedSeconds: number;
  createdAt: HLC;
  updatedAt: HLC;
  isDeleted: boolean;
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
