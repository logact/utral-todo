import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Search, X } from 'lucide-react';
import { getAllTodos, updateTodoStatus } from '../db/todos';
import type { Todo, TodoStatus } from '@utral/types';
import { nativeHaptic } from '../bridge/native';

export function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<TodoStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getAllTodos();
    setTodos(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when remote sync data arrives
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => load(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [load]);

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

  const query = searchQuery.trim().toLowerCase();
  const filtered = todos.filter((t) => {
    const matchesFilter = filter === 'all' || t.status === filter;
    const matchesSearch =
      !query ||
      t.title.toLowerCase().includes(query) ||
      (t.description?.toLowerCase().includes(query)) ||
      (t.instructions?.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tasks..."
          className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 border-0 focus:ring-2 focus:ring-indigo-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 dark:text-slate-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
