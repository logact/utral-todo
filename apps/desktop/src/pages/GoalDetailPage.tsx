import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getTodo } from '../db/todos';
import { GoalDetail } from './GoalDetail';
import type { Todo } from '../types';

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [goal, setGoal] = useState<Todo | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getTodo(id).then((loaded) => {
      setGoal(loaded);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!goal || goal.nodeType !== 'goal') {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Goal not found.</p>
        <button
          onClick={() => navigate('/goals')}
          className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
        >
          Back to Goals
        </button>
      </div>
    );
  }

  return <GoalDetail goal={goal} onUpdate={(updates) => setGoal((g) => (g ? { ...g, ...updates } : g))} />;
}
