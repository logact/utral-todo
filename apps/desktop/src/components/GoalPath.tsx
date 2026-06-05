import { Flag, MapPin, Circle, CheckCircle2, Target } from 'lucide-react';
import type { Todo } from '../types';

interface GoalPathProps {
  chain: Todo[];
  currentId: string;
  onNodeClick?: (todoId: string) => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'in_progress') return <Circle className="w-4 h-4 text-indigo-500 fill-indigo-500" />;
  return <Circle className="w-4 h-4 text-slate-300 dark:text-slate-500" />;
}

export function GoalPath({ chain, currentId, onNodeClick }: GoalPathProps) {
  if (chain.length === 0) return null;

  const currentIndex = chain.findIndex((t) => t.id === currentId);
  const ancestors = chain.slice(0, currentIndex + 1);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Flag className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Road to Goal
        </h2>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {ancestors.length} {ancestors.length === 1 ? 'step' : 'steps'}
        </span>
      </div>

      <div className="relative pl-4">
        {/* Vertical connecting line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="space-y-0">
          {ancestors.map((todo, index) => {
            const isCurrent = todo.id === currentId;
            const isRoot = index === 0;
            const isDone = todo.status === 'done';

            return (
              <div key={todo.id} className="relative flex items-start gap-3 py-1.5">
                {/* Node dot on the line */}
                <div className="relative z-10 shrink-0 mt-1.5">
                  {isCurrent ? (
                    <div className="w-[19px] h-[19px] rounded-full bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-400 dark:border-amber-500 flex items-center justify-center">
                      <MapPin className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                    </div>
                  ) : (
                    <div
                      className={`w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center ${
                        isDone
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700'
                          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isDone
                            ? 'bg-emerald-400'
                            : todo.status === 'in_progress'
                              ? 'bg-indigo-400'
                              : 'bg-slate-200 dark:bg-slate-600'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* Node card */}
                <button
                  onClick={() => !isCurrent && onNodeClick?.(todo.id)}
                  disabled={isCurrent}
                  className={`flex-1 min-w-0 text-left rounded-lg border px-3 py-2 transition-all ${
                    isCurrent
                      ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/50'
                      : isRoot && todo.isGoal
                        ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-400 dark:border-indigo-600 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/30'
                        : isRoot
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/40 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                          : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isRoot && todo.isGoal ? (
                      <Target className="w-4 h-4 text-indigo-500" />
                    ) : (
                      <StatusIcon status={todo.status} />
                    )}
                    <span
                      className={`text-sm font-medium truncate ${
                        isDone
                          ? 'text-slate-400 dark:text-slate-500 line-through'
                          : isCurrent
                            ? 'text-amber-800 dark:text-amber-300'
                            : isRoot && todo.isGoal
                              ? 'text-indigo-900 dark:text-indigo-200'
                              : isRoot
                                ? 'text-indigo-800 dark:text-indigo-300'
                                : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {todo.title}
                    </span>

                    {isRoot && todo.isGoal && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-white dark:text-indigo-100 uppercase tracking-wider shrink-0 bg-indigo-500 dark:bg-indigo-600 px-2 py-0.5 rounded">
                        <Target className="w-3 h-3" />
                        Goal
                      </span>
                    )}

                    {isCurrent && (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                        Here
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
