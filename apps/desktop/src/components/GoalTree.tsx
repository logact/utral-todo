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
  ArrowUpRight,
} from 'lucide-react';
import {
  getSubGoals,
  traceGoalChain,
  createGoal,
  deleteTodo,
  updateTodo,
} from '../db/todos';
import type { Todo, GoalStatus } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GoalTreeProps {
  goal: Todo;
  onChange: () => void;
}

interface GoalNodeProps {
  todo: Todo;
  depth: number;
  isCurrent: boolean;
  onChange: () => void;
}

/* ------------------------------------------------------------------ */
/*  Status Dot                                                         */
/* ------------------------------------------------------------------ */

function GoalStatusDot({
  status,
  size = 'sm',
  onClick,
}: {
  status?: string;
  size?: 'sm' | 'md';
  onClick?: () => void;
}) {
  const s = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const dotS = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';

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
      className={`${s} rounded-full flex items-center justify-center shrink-0 transition-colors ${
        onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
      } ${c.border} bg-white dark:bg-slate-800 border`}
    >
      <span className={`${dotS} rounded-full ${c.bg}`} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Label                                                       */
/* ------------------------------------------------------------------ */

function statusLabel(status?: string): string {
  if (status === 'achieved') return 'Achieved';
  if (status === 'paused') return 'Paused';
  if (status === 'abandoned') return 'Abandoned';
  return 'Active';
}

/* ------------------------------------------------------------------ */
/*  Next Status (cycle)                                                */
/* ------------------------------------------------------------------ */

const statusCycle: GoalStatus[] = ['active', 'paused', 'achieved', 'abandoned'];

function nextStatus(current?: GoalStatus): GoalStatus {
  const idx = statusCycle.indexOf(current ?? 'active');
  return statusCycle[(idx + 1) % statusCycle.length];
}

/* ------------------------------------------------------------------ */
/*  Goal Node (recursive)                                              */
/* ------------------------------------------------------------------ */

function GoalNode({ todo, depth, isCurrent, onChange }: GoalNodeProps) {
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

  // Auto-expand if this is the current node and it has children
  useEffect(() => {
    if (isCurrent && !isExpanded && children.length === 0) {
      loadChildren().then(() => setIsExpanded(true));
    }
  }, [isCurrent, isExpanded, children.length, loadChildren]);

  // Focus edit input when entering edit mode
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
    await createGoal(newChildTitle.trim(), { parentId: todo.id });
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
          className={`shrink-0 mt-1.5 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
            !hasChildren && children.length === 0 ? 'invisible' : ''
          }`}
        >
          {isLoadingChildren ? (
            <div className="w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-transparent rounded-full animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          )}
        </button>

        {/* Status dot with click to cycle */}
        <div className="shrink-0 mt-1">
          <GoalStatusDot status={todo.goalStatus} onClick={handleStatusClick} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${
              isCurrent
                ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
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
                className={`text-sm truncate text-left flex-1 min-w-0 leading-tight cursor-pointer ${
                  isDone
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : isCurrent
                      ? 'text-amber-800 dark:text-amber-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 font-medium hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
              >
                {todo.title}
              </button>
            )}

            {/* Status badge */}
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                todo.goalStatus === 'active'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                  : todo.goalStatus === 'paused'
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                    : todo.goalStatus === 'achieved'
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {statusLabel(todo.goalStatus)}
            </span>

            {/* Current badge */}
            {isCurrent && (
              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                Current
              </span>
            )}

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
                isCurrent={false}
                onChange={onChange}
              />
            </div>
          ))}

          {/* Add child button at bottom of expanded node */}
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
/*  Parent Chain Node                                                  */
/* ------------------------------------------------------------------ */

function ParentChainNode({ todo, onNavigate }: { todo: Todo; onNavigate: () => void }) {
  const navigate = useNavigate();
  const isDone = todo.goalStatus === 'achieved' || todo.goalStatus === 'abandoned';

  return (
    <div className="flex items-center gap-2 group">
      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
      <button
        onClick={() => {
          navigate(`/todo/${todo.id}`);
          onNavigate();
        }}
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
          isDone ? 'opacity-50' : ''
        }`}
      >
        <GoalStatusDot status={todo.goalStatus} />
        <span
          className={`text-sm truncate ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-600 dark:text-slate-400 font-medium'
          }`}
        >
          {todo.title}
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function GoalTree({ goal, onChange }: GoalTreeProps) {
  const [parentChain, setParentChain] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const chain = await traceGoalChain(goal.id);
      if (!cancelled) {
        // Remove the current goal from the chain (it's the last one)
        setParentChain(chain.slice(0, -1));
        setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [goal.id, refreshKey]);

  function handleChange() {
    setRefreshKey((k) => k + 1);
    onChange();
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Goal Hierarchy</h2>
        {parentChain.length > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
            {parentChain.length} ancestor{parentChain.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Loading...</p>
      ) : (
        <div className="space-y-1">
          {/* Parent chain */}
          {parentChain.length > 0 && (
            <div className="pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Parent Goal{parentChain.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-1">
                {parentChain.map((parent) => (
                  <ParentChainNode key={parent.id} todo={parent} onNavigate={onChange} />
                ))}
              </div>
            </div>
          )}

          {/* Current goal */}
          <GoalNode todo={goal} depth={0} isCurrent={true} onChange={handleChange} />
        </div>
      )}
    </div>
  );
}
