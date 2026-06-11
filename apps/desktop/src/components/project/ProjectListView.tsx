import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { clsx } from 'clsx';
import type { Todo, TodoStatus } from '../../types';

const STATUS_ICON: Record<TodoStatus, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

const STATUS_CLASS: Record<TodoStatus, string> = {
  pending: 'text-slate-400 dark:text-slate-500',
  in_progress: 'text-blue-500',
  done: 'text-emerald-500',
};

const PRIORITY_CLASS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400 font-medium',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-slate-500 dark:text-slate-400',
};

interface ProjectListViewProps {
  projectId: string;
  todos: Todo[];
  projectColor: string;
  onUpdateStatus: (todoId: string, status: TodoStatus) => Promise<void>;
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>;
}

// Props kept for API compatibility with parent

type SortKey = 'status' | 'priority' | 'dueDate' | 'scheduledDate' | 'title';

export function ProjectListView({ todos, onUpdateStatus }: ProjectListViewProps) {
  const [sortBy, setSortBy] = useState<SortKey>('status');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Build parent-child map
  const { rootTodos, childrenMap } = useMemo(() => {
    const children = new Map<string, Todo[]>();
    const roots: Todo[] = [];

    for (const todo of todos) {
      if (todo.parentId) {
        const list = children.get(todo.parentId) || [];
        list.push(todo);
        children.set(todo.parentId, list);
      } else {
        roots.push(todo);
      }
    }

    // Sort children within each parent
    for (const [, list] of children) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    return { rootTodos: roots, childrenMap: children };
  }, [todos]);

  const sortedRoots = useMemo(() => {
    const sorted = [...rootTodos];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'status':
          const order = { in_progress: 0, pending: 1, done: 2 };
          cmp = (order[a.status ?? 'pending'] ?? 1) - (order[b.status ?? 'pending'] ?? 1);
          break;
        case 'priority':
          const pOrder = { high: 0, medium: 1, low: 2 };
          cmp = (pOrder[a.priority ?? 'medium'] ?? 1) - (pOrder[b.priority ?? 'medium'] ?? 1);
          break;
        case 'dueDate':
          cmp = (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
          break;
        case 'scheduledDate':
          cmp = (a.scheduledDate?.getTime() ?? Infinity) - (b.scheduledDate?.getTime() ?? Infinity);
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [rootTodos, sortBy, sortAsc]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(true);
    }
  };

  if (todos.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">No todos in this project yet.</p>
        <Link
          to="/todo/new"
          className="text-indigo-600 hover:underline text-sm mt-2 inline-block"
        >
          Create a todo
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_100px_80px_100px_100px_60px] gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400">
        <button onClick={() => handleSort('title')} className="flex items-center gap-1 text-left hover:text-slate-700 dark:hover:text-slate-300">
          Title <ArrowUpDown className="w-3 h-3" />
        </button>
        <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
          Status <ArrowUpDown className="w-3 h-3" />
        </button>
        <button onClick={() => handleSort('priority')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
          Priority <ArrowUpDown className="w-3 h-3" />
        </button>
        <button onClick={() => handleSort('dueDate')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
          Due <ArrowUpDown className="w-3 h-3" />
        </button>
        <button onClick={() => handleSort('scheduledDate')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
          Schedule <ArrowUpDown className="w-3 h-3" />
        </button>
        <span className="text-right">Time</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {sortedRoots.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            childrenMap={childrenMap}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            onUpdateStatus={onUpdateStatus}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  childrenMap,
  expandedIds,
  toggleExpanded,
  onUpdateStatus,
  depth,
}: {
  todo: Todo;
  childrenMap: Map<string, Todo[]>;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onUpdateStatus: (todoId: string, status: TodoStatus) => Promise<void>;
  depth: number;
}) {
  const children = childrenMap.get(todo.id) || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(todo.id);
  const StatusIcon = STATUS_ICON[todo.status ?? 'pending'];

  const cycleStatus = () => {
    const status = todo.status ?? 'pending';
    const next: TodoStatus =
      status === 'pending' ? 'in_progress' :
      status === 'in_progress' ? 'done' : 'pending';
    onUpdateStatus(todo.id, next);
  };

  return (
    <>
      <div
        className={clsx(
          'grid grid-cols-[1fr_100px_80px_100px_100px_60px] gap-2 px-4 py-2.5 items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
          (todo.status ?? 'pending') === 'done' && 'opacity-60'
        )}
      >
        <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: depth * 20 }}>
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(todo.id)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <button
            onClick={cycleStatus}
            className={clsx('flex-shrink-0', STATUS_CLASS[todo.status ?? 'pending'])}
            title="Click to cycle status"
          >
            <StatusIcon className="w-4 h-4" />
          </button>
          <Link
            to={`/todo/${todo.id}`}
            className={clsx(
              'truncate text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors',
              (todo.status ?? 'pending') === 'done' ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
            )}
            title={todo.title}
          >
            {todo.title}
          </Link>
        </div>
        <span className={clsx('text-xs', STATUS_CLASS[todo.status ?? 'pending'])}>
          {(todo.status ?? 'pending').replace('_', ' ')}
        </span>
        <span className={clsx('text-xs', PRIORITY_CLASS[todo.priority ?? 'medium'])}>
          {todo.priority ?? 'medium'}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {todo.dueDate ? new Date(todo.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-'}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {todo.scheduledDate ? new Date(todo.scheduledDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-'}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 text-right">
          {todo.estimatedMinutes}m
        </span>
      </div>

      {isExpanded && hasChildren && children.map((child) => (
        <TodoRow
          key={child.id}
          todo={child}
          childrenMap={childrenMap}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          onUpdateStatus={onUpdateStatus}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
