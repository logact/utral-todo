export type TodoStatus = 'pending' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type TodoLogType = 'progress' | 'thought' | 'blocker' | 'decision' | 'system' | 'step_complete' | 'exec';

export type NodeType = 'goal' | 'task';
export type TaskPattern = 'task' | 'cognitive' | 'timeSlot';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';

export type ActionEdgeType = 'pre_do' | 'parent_child' | 'to_achieve';

// Legacy action-edge types are preserved only for rendering old data.
// New edges should use one of the semantic ActionEdgeType values above.
export type ActionEdgeTypeLegacy = 'insight' | 'try';

export type ActionEdgeTypeAll = ActionEdgeType | ActionEdgeTypeLegacy;

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

export type PluseTimerStatus = 'idle' | 'running' | 'paused';
export type DevicePlatform = 'ios' | 'watchos' | 'desktop';
