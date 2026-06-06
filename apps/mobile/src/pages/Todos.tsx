import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { getAllTodos, updateTodoStatus } from '../db/todos';
import type { Todo, TodoStatus } from '@utral/types';
import { nativeHaptic } from '../bridge/native';

export function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<TodoStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllTodos().then((all) => {
      setTodos(all);
      setLoading(false);
    });
  }, []);

  async function toggleStatus(todo: Todo) {
    const newStatus: TodoStatus = todo.status === 'done' ? 'pending' : 'done';
    await updateTodoStatus(todo.id, newStatus);
    nativeHaptic.impact('light').catch(() => {});
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id ? { ...t, status: newStatus, completedAt: newStatus === 'done' ? new Date() : undefined } : t
      )
    );
  }

  const filtered = filter === 'all' ? todos : todos.filter((t) => t.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'pending', 'in_progress', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {filtered.map((todo) => (
          <div
            key={todo.id}
            className="flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-xl active:bg-slate-100 dark:active:bg-slate-800/50"
          >
            <button onClick={() => toggleStatus(todo)} className="mt-0.5 shrink-0">
              {todo.status === 'done' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
              )}
            </button>
            <Link to={`/todo/${todo.id}`} className="flex-1 min-w-0">
              <p
                className={`text-[15px] font-medium truncate ${
                  todo.status === 'done'
                    ? 'text-slate-400 dark:text-slate-500 line-through'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {todo.title}
              </p>
            </Link>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">No tasks</p>
        )}
        <div className="h-8" />
      </div>
    </div>
  );
}
