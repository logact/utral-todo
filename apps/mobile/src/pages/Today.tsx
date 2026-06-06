import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, Zap, Target } from 'lucide-react';
import { getTodaysTodos, getInProgressTodos, getOverdueTodos, updateTodoStatus } from '../db/todos';
import type { Todo, TodoStatus } from '@utral/types';
import { nativeHaptic } from '../bridge/native';

export function Today({ onQuickCreate }: { onQuickCreate?: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inProgress, setInProgress] = useState<Todo[]>([]);
  const [overdue, setOverdue] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [today, progress, overdueList] = await Promise.all([
      getTodaysTodos(),
      getInProgressTodos(),
      getOverdueTodos(),
    ]);
    setTodos(today);
    setInProgress(progress);
    setOverdue(overdueList);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleStatus(todo: Todo) {
    const newStatus: TodoStatus = todo.status === 'done' ? 'pending' : 'done';
    await updateTodoStatus(todo.id, newStatus);
    nativeHaptic.impact('light').catch(() => {});
    refresh();
  }

  async function startTodo(todo: Todo) {
    await updateTodoStatus(todo.id, 'in_progress');
    nativeHaptic.impact('medium').catch(() => {});
    refresh();
  }

  const allTodos = [...overdue, ...inProgress, ...todos];
  const doneCount = allTodos.filter((t) => t.status === 'done').length;
  const totalCount = allTodos.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              inProgress.length > 0
                ? 'bg-amber-400 animate-pulse'
                : totalCount > doneCount
                  ? 'bg-indigo-400'
                  : 'bg-emerald-400'
            }`}
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {inProgress.length > 0
              ? `${inProgress.length} in progress`
              : totalCount > doneCount
                ? `${totalCount - doneCount} left`
                : 'All done'}
          </span>
        </div>
        {doneCount > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {doneCount} done
          </span>
        )}
      </div>

      {/* Todo list */}
      {allTodos.length === 0 ? (
        <div className="text-center py-12">
          <Target className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
            No tasks for today
          </p>
          <button
            onClick={onQuickCreate}
            className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 font-medium"
          >
            Add your first task
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {allTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleStatus(todo)}
              onStart={() => startTodo(todo)}
            />
          ))}
          <div className="h-8" />
        </div>
      )}
    </div>
  );
}

function TodoItem({
  todo,
  onToggle,
  onStart,
}: {
  todo: Todo;
  onToggle: () => void;
  onStart: () => void;
}) {
  const isDone = todo.status === 'done';
  const isInProgress = todo.status === 'in_progress';

  const priorityColor =
    todo.priority === 'high'
      ? 'text-rose-500'
      : todo.priority === 'medium'
        ? 'text-amber-500'
        : 'text-slate-400';

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-xl active:bg-slate-100 dark:active:bg-slate-800/50">
      <button onClick={onToggle} className="mt-0.5 shrink-0">
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
        )}
      </button>

      <Link
        to={`/todo/${todo.id}`}
        className="flex-1 min-w-0"
        onClick={(e) => {
          if (todo.status === 'pending') {
            e.preventDefault();
            onStart();
          }
        }}
      >
        <p
          className={`text-[15px] font-medium truncate ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {todo.scheduledDate && (
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Clock className="w-3 h-3" />
              {formatTime(todo.scheduledDate)}
            </span>
          )}
          <span className={`text-xs font-medium ${priorityColor}`}>
            {todo.priority}
          </span>
          {isInProgress && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Zap className="w-3 h-3" />
              In Progress
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
