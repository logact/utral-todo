import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  CornerDownRight,
} from 'lucide-react';
import { getSubTodos, createTodo, deleteTodo, updateTodoStatus, reorderSubTodos } from '../db/todos';
import { formatDuration } from '../utils/date';
import type { Todo } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TodoTreeProps {
  parentId: string;
  todos: Todo[];
  isEditing: boolean;
  onChange: () => void;
}

interface TreeNodeProps {
  todo: Todo;
  depth: number;
  isEditing: boolean;
  isTopLevel: boolean;
  onChange: () => void;
  index?: number;
  totalSiblings?: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Status Icon                                                        */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  if (status === 'done')
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
      </span>
    );
  if (status === 'in_progress')
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-indigo-500" />
      </span>
    );
  return (
    <span className="w-[18px] h-[18px] rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree Node Item (recursive)                                         */
/* ------------------------------------------------------------------ */

function TreeNodeItem({
  todo,
  depth,
  isEditing,
  isTopLevel,
  onChange,
  index,
  totalSiblings,
  onMoveUp,
  onMoveDown,
}: TreeNodeProps) {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Todo[]>([]);
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildTitle, setNewChildTitle] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const hasChildren = children.length > 0 || (!isExpanded && todo.status !== 'done');
  const isDone = todo.status === 'done';

  const loadChildren = useCallback(async () => {
    setIsLoadingChildren(true);
    const subs = await getSubTodos(todo.id);
    setChildren(subs);
    setIsLoadingChildren(false);
  }, [todo.id]);

  const toggleExpand = useCallback(async () => {
    if (!isExpanded && children.length === 0) {
      await loadChildren();
    }
    setIsExpanded((prev) => !prev);
  }, [isExpanded, children.length, loadChildren]);

  async function handleToggleDone() {
    const newStatus = isDone ? 'pending' : 'done';
    await updateTodoStatus(todo.id, newStatus as 'pending' | 'done');
    onChange();
  }

  async function handleAddChild() {
    if (!newChildTitle.trim()) return;
    await createTodo(newChildTitle.trim(), { parentId: todo.id });
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

        {/* Status toggle (top level only) or just display */}
        {isTopLevel ? (
          <button onClick={handleToggleDone} className="shrink-0 mt-1">
            <StatusDot status={todo.status} />
          </button>
        ) : (
          <div className="shrink-0 mt-1">
            <StatusDot status={todo.status} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${
              isTopLevel ? '' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
            onClick={() => !isTopLevel && navigate(`/todo/${todo.id}`)}
          >
            <span
              className={`text-sm truncate ${
                isDone
                  ? 'text-slate-400 dark:text-slate-500 line-through'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {todo.title}
            </span>
            {todo.estimatedMinutes > 0 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                {formatDuration(todo.estimatedMinutes)}
              </span>
            )}
            {children.length > 0 && isExpanded && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                {children.filter((c) => c.status === 'done').length}/{children.length}
              </span>
            )}

            {/* Top-level edit actions */}
            {isTopLevel && isEditing && (
              <div className="flex items-center gap-0.5 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp?.();
                  }}
                  disabled={index === 0}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 p-1"
                  title="Move up"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown?.();
                  }}
                  disabled={index === (totalSiblings ?? 1) - 1}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 p-1"
                  title="Move down"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleting(true);
                  }}
                  className="text-slate-400 hover:text-rose-500 p-1"
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
                Delete "{todo.title}"? This will also remove all sub-tasks.
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
                placeholder="New sub-task..."
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
              <TreeNodeItem
                todo={child}
                depth={depth + 1}
                isEditing={false}
                isTopLevel={false}
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
              Add sub-task
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
            Add sub-task
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function TodoTree({ parentId, todos, isEditing, onChange }: TodoTreeProps) {
  const [newStepTitle, setNewStepTitle] = useState('');

  async function handleAddStep() {
    if (!newStepTitle.trim()) return;
    await createTodo(newStepTitle.trim(), { parentId });
    setNewStepTitle('');
    onChange();
  }

  async function moveStep(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === todos.length - 1) return;
    const orderedIds = todos.map((s) => s.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    await reorderSubTodos(parentId, orderedIds);
    onChange();
  }

  return (
    <div className="space-y-1">
      {todos.map((todo, index) => (
        <TreeNodeItem
          key={todo.id}
          todo={todo}
          depth={0}
          isEditing={isEditing}
          isTopLevel={true}
          onChange={onChange}
          index={index}
          totalSiblings={todos.length}
          onMoveUp={() => moveStep(index, 'up')}
          onMoveDown={() => moveStep(index, 'down')}
        />
      ))}

      {/* Add step form */}
      <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
        <Plus className="w-4 h-4 text-indigo-500 shrink-0 ml-1" />
        <input
          type="text"
          value={newStepTitle}
          onChange={(e) => setNewStepTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
          placeholder="Add a step..."
          className="flex-1 min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleAddStep}
          disabled={!newStepTitle.trim()}
          className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          Add
        </button>
      </div>
    </div>
  );
}
