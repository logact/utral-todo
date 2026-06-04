import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { TodoExecutionPanel } from '../components/TodoExecutionPanel';

export function TodoExecute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div className="text-slate-500 dark:text-slate-400">
        Invalid todo ID.
        <button
          onClick={() => navigate(-1)}
          className="ml-2 text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <TodoExecutionPanel
        todoId={id}
        onNavigate={(path) => navigate(path)}
        showBreadcrumbs
        autoStart
      />
    </div>
  );
}
