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
}

export type TodoRelationType = 'depends_on' | 'blocked_by' | 'parent_of' | 'source_from' | 'assign_from';

export interface TodoRelation {
  id: string;
  fromTodoId: string;
  toTodoId: string;
  type: TodoRelationType;
  createdAt: Date;
}

export interface RepeatRule {
  type: 'daily' | 'weekly' | 'every_n_days';
  weekDays?: number[];
  interval?: number;
  endDate?: Date;
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
  createdAt: Date;
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
