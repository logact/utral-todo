export type TodoStatus = 'pending' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type TodoLogType = 'progress' | 'thought' | 'blocker' | 'decision' | 'system' | 'step_complete';

export type ActionEdgeType = 'insight' | 'try' | 'pre_do';

export interface ActionEdge {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: ActionEdgeType;
  createdAt: Date;
  updatedAt: Date;
}

export type TodoRelationType = 'depends_on' | 'blocked_by' | 'parent_of' | 'source_from' | 'assign_from';

export interface TodoRelation {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: TodoRelationType;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface Todo {
  id: string;
  projectId?: string;
  parentId?: string;
  title: string;
  description: string;
  instructions: string;
  status: TodoStatus;
  priority: Priority;
  estimatedMinutes: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  scheduledDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  repeatRule?: RepeatRule;
  order: number;
  isGoal?: boolean;
}

export interface TodoLog {
  id: string;
  todoId: string;
  type: TodoLogType;
  content: string;
  minutesSpent?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapStep {
  todoId: string;
  title: string;
  status: TodoStatus;
  estimatedMinutes: number;
  level: number;
  state: 'done' | 'ready' | 'blocked' | 'goal';
}

export interface RoadmapPhase {
  id: string;
  title: string;
  order: number;
  todoIds: string[];
  startAt?: Date;
  endAt?: Date;
}

export interface Roadmap {
  id: string;
  goalTodoId: string;
  phases: RoadmapPhase[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Pluse {
  id: string;
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  intervalTodos?: Record<number, string>;
  autoAdvance?: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  color: string;
  status: 'active' | 'archived';
  deadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncPayload {
  todos?: Todo[];
  projects?: Project[];
  relations?: TodoRelation[];
  todoLogs?: TodoLog[];
  roadmaps?: Roadmap[];
  actionEdges?: ActionEdge[];
  pluses?: Pluse[];
  timerSessions?: TimerSession[];
  repeatOccurrences?: RepeatOccurrence[];
}

export interface SyncEvent {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;
  deviceId: string;
  createdAt: Date;
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
    projects: number;
    relations: number;
    todoLogs: number;
    roadmaps: number;
    actionEdges: number;
    pluses: number;
    timerSessions: number;
  };
  pushed: {
    todos: number;
    projects: number;
    relations: number;
    todoLogs: number;
    roadmaps: number;
    actionEdges: number;
    pluses: number;
    timerSessions: number;
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

export interface MobileTodo {
  id: string;
  title: string;
  status: TodoStatus;
  priority: Priority;
  estimatedMinutes: number;
  projectId?: string;
  projectTitle?: string;
  projectColor?: string;
  scheduledDate?: Date;
  dueDate?: Date;
  order: number;
}

export interface WatchTodo {
  id: string;
  title: string;
  status: TodoStatus;
  projectColor: string;
  estimatedMinutes: number;
}

export interface MobileTodayResponse {
  todos: MobileTodo[];
  projects: Project[];
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
