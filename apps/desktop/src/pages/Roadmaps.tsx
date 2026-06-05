import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapIcon, ChevronRight, Clock, Layers, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { getAllRoadmaps } from '../db/roadmaps';
import { getAllTodos } from '../db/todos';
import { formatDuration } from '../utils/date';
import type { Roadmap, Todo, TodoStatus } from '../types';

interface RoadmapSummary {
  roadmap: Roadmap;
  goalTodo: Todo | undefined;
  phaseCount: number;
  todoCount: number;
  doneCount: number;
  inProgressCount: number;
  totalMinutes: number;
}

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === 'in_progress') return <Loader2 className="w-4 h-4 text-indigo-500 shrink-0 animate-spin" />;
  return <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />;
}

function RoadmapCard({ summary }: { summary: RoadmapSummary }) {
  const navigate = useNavigate();
  const { roadmap, goalTodo, phaseCount, todoCount, doneCount, inProgressCount, totalMinutes } = summary;
  const progressPct = todoCount > 0 ? Math.round((doneCount / todoCount) * 100) : 0;

  return (
    <button
      onClick={() => navigate(`/roadmap/${roadmap.goalTodoId}`)}
      className="w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {goalTodo ? <StatusIcon status={goalTodo.status} /> : <MapIcon className="w-4 h-4 text-slate-400 shrink-0" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {goalTodo?.title ?? 'Untitled Goal'}
          </h3>
          {goalTodo?.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{goalTodo.description}</p>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <Layers className="w-3 h-3" />
              {phaseCount} phase{phaseCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-3 h-3" />
              {doneCount}/{todoCount} done
            </span>
            {totalMinutes > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <Clock className="w-3 h-3" />
                {formatDuration(totalMinutes)}
              </span>
            )}
            {inProgressCount > 0 && (
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                {inProgressCount} in progress
              </span>
            )}
          </div>

          {/* Progress bar */}
          {todoCount > 0 && (
            <div className="mt-3">
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-1 group-hover:text-indigo-400 transition-colors" />
      </div>
    </button>
  );
}

export function Roadmaps() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [rms, allTodos] = await Promise.all([getAllRoadmaps(), getAllTodos()]);
      // Deduplicate by goalTodoId — keep the most recently updated one
      const byGoal = new Map<string, Roadmap>();
      for (const rm of rms) {
        const existing = byGoal.get(rm.goalTodoId);
        if (!existing || rm.updatedAt > existing.updatedAt) {
          byGoal.set(rm.goalTodoId, rm);
        }
      }
      setRoadmaps(Array.from(byGoal.values()));
      setTodos(allTodos);
      setIsLoading(false);
    }
    load();
  }, []);

  const todoMap = useMemo(() => {
    const map = new Map<string, Todo>();
    for (const t of todos) map.set(t.id, t);
    return map;
  }, [todos]);

  const summaries = useMemo(() => {
    return roadmaps.map((rm): RoadmapSummary => {
      const allTodoIds = rm.phases.flatMap((p) => p.todoIds);
      const uniqueTodoIds = [...new Set(allTodoIds)];
      let doneCount = 0;
      let inProgressCount = 0;
      let totalMinutes = 0;
      for (const id of uniqueTodoIds) {
        const t = todoMap.get(id);
        if (!t) continue;
        if (t.status === 'done') doneCount++;
        else if (t.status === 'in_progress') inProgressCount++;
        totalMinutes += t.estimatedMinutes ?? 0;
      }
      return {
        roadmap: rm,
        goalTodo: todoMap.get(rm.goalTodoId),
        phaseCount: rm.phases.length,
        todoCount: uniqueTodoIds.length,
        doneCount,
        inProgressCount,
        totalMinutes,
      };
    });
  }, [roadmaps, todoMap]);

  const totalTodos = summaries.reduce((s, r) => s + r.todoCount, 0);
  const totalDone = summaries.reduce((s, r) => s + r.doneCount, 0);
  const overallPct = totalTodos > 0 ? Math.round((totalDone / totalTodos) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
        Loading roadmaps...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <MapIcon className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Roadmaps</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {summaries.length} roadmap{summaries.length !== 1 ? 's' : ''} &middot; {totalDone} of {totalTodos} todos completed
        </p>

        {summaries.length > 0 && (
          <div className="mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall progress</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{overallPct}%</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* List */}
      {summaries.length === 0 ? (
        <div className="text-center py-16">
          <MapIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">No roadmaps yet.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Open any todo and click "Roadmap" to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summaries.map((summary) => (
            <RoadmapCard key={summary.roadmap.id} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}
