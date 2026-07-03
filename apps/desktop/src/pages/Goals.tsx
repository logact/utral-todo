import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Target, Loader2 } from 'lucide-react';
import type { Todo } from '../types';
import { dbStore } from '../db/store';
import { createGoal, getAllTodos } from '@utral/db-schema/todo-ops';

export function Goals() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const allTodos = await getAllTodos(dbStore);
      const goalTodos = allTodos.filter((t) => t.nodeType === 'goal');
      setGoals(goalTodos);
      setLoading(false);
    }
    load();
  }, []);

  async function handleCreateGoal() {
    const title = prompt('Goal title:');
    if (!title) return;
    const goal = await createGoal(dbStore, title.trim());
    navigate(`/goals/${goal.id}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Goals</h1>
        <button
          onClick={handleCreateGoal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <Target className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No goals yet.</p>
          <button
            onClick={handleCreateGoal}
            className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
          >
            Create your first goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => (
            <button
              key={goal.id}
              onClick={() => navigate(`/goals/${goal.id}`)}
              className="text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
                  <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {goal.title}
                  </h3>
                  {goal.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {goal.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
