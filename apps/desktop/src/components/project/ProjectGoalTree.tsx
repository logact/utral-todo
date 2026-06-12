import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Pencil,
  Target,
  CornerDownRight,
  ArrowRight,
  Flag,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  getSubGoals,
  createGoal,
  deleteTodo,
  updateTodo,
} from '../../db/todos';
import type { Todo, GoalStatus } from '../../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectGoalTreeProps {
  projectId: string;
  mainGoalId?: string;
  projectColor: string;
  goals: Todo[];
  onSetMainGoal: (goalId: string | undefined) => void;
  onRefresh: () => void;
}

interface GoalNodeProps {
  todo: Todo;
  depth: number;
  projectColor: string;
  onChange: () => void;
}

/* ------------------------------------------------------------------ */
/*  Status helpers (copied from GoalTree.tsx)                          */
/* ------------------------------------------------------------------ */

const statusCycle: GoalStatus[] = ['active', 'paused', 'achieved', 'abandoned'];

function nextStatus(current?: GoalStatus): GoalStatus {
  const idx = statusCycle.indexOf(current ?? 'active');
  return statusCycle[(idx + 1) % statusCycle.length];
}

function statusLabel(status?: string): string {
  if (status === 'achieved') return 'Achieved';
  if (status === 'paused') return 'Paused';
  if (status === 'abandoned') return 'Abandoned';
  return 'Active';
}

function GoalStatusDot({
  status,
  onClick,
}: {
  status?: string;
  onClick?: () => void;
}) {
  const config: Record<string, { border: string; bg: string }> = {
    active: { border: 'border-emerald-300 dark:border-emerald-700', bg: 'bg-emerald-500' },
    paused: { border: 'border-amber-300 dark:border-amber-700', bg: 'bg-amber-500' },
    achieved: { border: 'border-blue-300 dark:border-blue-700', bg: 'bg-blue-500' },
    abandoned: { border: 'border-slate-300 dark:border-slate-600', bg: 'bg-slate-400 dark:bg-slate-500' },
  };
  const c = config[status ?? 'active'] ?? config.active;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors',
        onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
        c.border,
        'bg-white dark:bg-slate-800 border'
      )}
    >
      <span className={clsx('w-2 h-2 rounded-full', c.bg)} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Recursive Goal Node                                                */
/* ------------------------------------------------------------------ */

function GoalNode({ todo, depth, projectColor, onChange }: GoalNodeProps) {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Todo[]>([]);
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildTitle, setNewChildTitle] = useState('');

  const [isDeleting, setIsDeleting] = useState(false);

  const loadChildren = useCallback(async () => {
    setIsLoadingChildren(true);
    const subs = await getSubGoals(todo.id);
    setChildren(subs);
    setIsLoadingChildren(false);
  }, [todo.id]);

  const toggleExpand = useCallback(async () => {
    if (!isExpanded && children.length === 0) {
      await loadChildren();
    }
    setIsExpanded((prev) => !prev);
  }, [isExpanded, children.length, loadChildren]);

  useEffect(() => {
    if (isEditingTitle) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [isEditingTitle]);

  async function handleStatusClick() {
    const newStatus = nextStatus(todo.goalStatus);
    await updateTodo(todo.id, { goalStatus: newStatus });
    onChange();
  }

  async function handleSaveTitle() {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === todo.title) {
      setIsEditingTitle(false);
      setEditTitle(todo.title);
      return;
    }
    await updateTodo(todo.id, { title: trimmed });
    setIsEditingTitle(false);
    onChange();
  }

  async function handleAddChild() {
    if (!newChildTitle.trim()) return;
    await createGoal(newChildTitle.trim(), { parentId: todo.id, projectId: todo.projectId });
    setNewChildTitle('');
    setIsAddingChild(false);
    await loadChildren();
    setIsExpanded(true);
    onChange();
  }

  async function handleDelete() {
    await deleteTodo(todo.id);
    setIsDeleting(false);
    onChange();
  }

  const hasChildren = children.length > 0 || !isExpanded || isLoadingChildren;
  const isDone = todo.goalStatus === 'achieved' || todo.goalStatus === 'abandoned';

  return (
    <div className="relative">
      {/* Node row */}
      <div className="flex items-start gap-2 group">
        {/* Expand/collapse toggle */}
        <button
          onClick={toggleExpand}
          className={clsx(
            'shrink-0 mt-1.5 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
            !hasChildren && children.length === 0 ? 'invisible' : ''
          )}
        >
          {isLoadingChildren ? (
            <div className="w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-transparent rounded-full animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          )}
        </button>

        {/* Status dot */}
        <div className="shrink-0 mt-1">
          <GoalStatusDot status={todo.goalStatus} onClick={handleStatusClick} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
            {/* Title — editable or display */}
            {isEditingTitle ? (
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                    setEditTitle(todo.title);
                  }
                }}
                onBlur={handleSaveTitle}
                className="flex-1 min-w-0 px-2 py-0.5 rounded text-sm bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <button
                onClick={() => navigate(`/todo/${todo.id}`)}
                className={clsx(
                  'text-sm truncate text-left flex-1 min-w-0 leading-tight cursor-pointer',
                  isDone
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : 'text-slate-700 dark:text-slate-300 font-medium hover:text-indigo-600 dark:hover:text-indigo-400'
                )}
              >
                {todo.title}
              </button>
            )}

            {/* Status badge */}
            <span
              className={clsx(
                'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                todo.goalStatus === 'active'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                  : todo.goalStatus === 'paused'
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                    : todo.goalStatus === 'achieved'
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              )}
            >
              {statusLabel(todo.goalStatus)}
            </span>

            {/* Action buttons — appear on hover */}
            {!isEditingTitle && (
              <div className="flex items-center gap-0.5 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditTitle(todo.title);
                    setIsEditingTitle(true);
                  }}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  title="Edit title"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingChild(true);
                    setNewChildTitle('');
                  }}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                  title="Add sub-goal"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleting(true);
                  }}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Delete confirmation */}
          {isDeleting && (
            <div className="mt-1.5 mb-2 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-800/40 p-2">
              <p className="text-xs text-rose-700 dark:text-rose-400 mb-2">
                Delete &quot;{todo.title}&quot;? This will also remove all sub-goals and sub-tasks.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  className="px-2.5 py-1 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setIsDeleting(false)}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Inline add child form */}
          {isAddingChild && (
            <div className="mt-1.5 mb-2 flex items-center gap-2">
              <CornerDownRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <input
                type="text"
                value={newChildTitle}
                onChange={(e) => setNewChildTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddChild();
                  if (e.key === 'Escape') {
                    setIsAddingChild(false);
                    setNewChildTitle('');
                  }
                }}
                placeholder="New sub-goal..."
                autoFocus
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleAddChild}
                disabled={!newChildTitle.trim()}
                className="bg-indigo-600 text-white px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingChild(false);
                  setNewChildTitle('');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-1.5 shrink-0"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && children.length > 0 && (
        <div className="relative ml-2.5 pl-5 border-l border-slate-200 dark:border-slate-700">
          {children.map((child) => (
            <div key={child.id} className="relative">
              {/* Horizontal connector */}
              <div className="absolute left-[-21px] top-4 w-4 h-px bg-slate-200 dark:bg-slate-700" />
              <GoalNode
                todo={child}
                depth={depth + 1}
                projectColor={projectColor}
                onChange={onChange}
              />
            </div>
          ))}

          {/* Add child button at bottom */}
          <div className="relative">
            <div className="absolute left-[-21px] top-3 w-4 h-px bg-slate-200 dark:bg-slate-700" />
            <button
              onClick={() => {
                setIsAddingChild(true);
                setNewChildTitle('');
              }}
              className="flex items-center gap-1.5 py-1.5 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add sub-goal
            </button>
          </div>
        </div>
      )}

      {/* Add child button when expanded but no children */}
      {isExpanded && children.length === 0 && !isAddingChild && (
        <div className="relative ml-2.5 pl-5 border-l border-slate-200 dark:border-slate-700">
          <div className="absolute left-[-21px] top-3 w-4 h-px bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => {
              setIsAddingChild(true);
              setNewChildTitle('');
            }}
            className="flex items-center gap-1.5 py-1.5 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add sub-goal
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MainGoalSetup — shown when no main goal is set                     */
/* ------------------------------------------------------------------ */

function MainGoalSetup({
  goals,
  projectColor,
  onSelect,
  onCreate,
}: {
  goals: Todo[];
  projectColor: string;
  onSelect: (goalId: string) => void;
  onCreate: (title: string) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const rootGoals = goals.filter((g) => g.nodeType === 'goal' && !g.parentId);

  function handleCreate() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewTitle('');
    setIsCreating(false);
  }

  return (
    <div className="space-y-6">
      {/* Existing goals section */}
      {rootGoals.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Select an existing goal as the main goal:
          </p>
          <div className="space-y-2">
            {rootGoals.map((goal) => (
              <button
                key={goal.id}
                onClick={() => onSelect(goal.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group"
              >
                <GoalStatusDot status={goal.goalStatus} />
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {goal.title}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create new goal section */}
      <div>
        {!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: projectColor }}
          >
            <Plus className="w-4 h-4" />
            Create new main goal
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewTitle('');
                }
              }}
              placeholder="Main goal title..."
              autoFocus
              className="flex-1 min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              className="px-3 py-2 rounded-md text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              style={{ backgroundColor: projectColor }}
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewTitle('');
              }}
              className="px-3 py-2 rounded-md text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 shrink-0"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {rootGoals.length === 0 && !isCreating && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No goals exist in this project yet. Create a main goal to start building your goal tree.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ProjectGoalTree({
  projectId,
  mainGoalId,
  projectColor,
  goals,
  onSetMainGoal,
  onRefresh,
}: ProjectGoalTreeProps) {
  const [mainGoal, setMainGoal] = useState<Todo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!mainGoalId) {
      setMainGoal(null);
      return;
    }
    const goalId = mainGoalId;
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const { getTodo } = await import('../../db/todos');
      const goal = await getTodo(goalId);
      if (!cancelled) {
        setMainGoal(goal ?? null);
        setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mainGoalId, refreshKey]);

  function handleChange() {
    setRefreshKey((k) => k + 1);
    onRefresh();
  }

  async function handleCreateMainGoal(title: string) {
    const newGoal = await createGoal(title, { projectId });
    onSetMainGoal(newGoal.id);
    onRefresh();
  }

  // No main goal set — show setup UI
  if (!mainGoalId) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Target className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Set a Main Goal
          </h2>
        </div>
        <MainGoalSetup
          goals={goals}
          projectColor={projectColor}
          onSelect={onSetMainGoal}
          onCreate={handleCreateMainGoal}
        />
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
          Loading goal tree...
        </p>
      </div>
    );
  }

  // Main goal not found (was deleted)
  if (!mainGoal) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Target className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Main Goal Removed
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          The main goal for this project no longer exists. Set a new one below.
        </p>
        <MainGoalSetup
          goals={goals}
          projectColor={projectColor}
          onSelect={onSetMainGoal}
          onCreate={handleCreateMainGoal}
        />
      </div>
    );
  }

  // Render the goal tree
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Goal Tree
          </h2>
        </div>
        <button
          onClick={() => onSetMainGoal(undefined)}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Change main goal
        </button>
      </div>

      <GoalNode
        todo={mainGoal}
        depth={0}
        projectColor={projectColor}
        onChange={handleChange}
      />
    </div>
  );
}
