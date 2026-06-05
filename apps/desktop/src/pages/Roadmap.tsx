import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  Map as MapIcon,
  X,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import { useRoadmapEditor } from '../hooks/useRoadmapEditor';
import { useTodos } from '../hooks/useTodos';
import { formatDuration } from '../utils/date';
import type { TodoStatus } from '../types';

function toDateTimeLocal(d: Date | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(v: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatPhaseDuration(startAt?: Date, endAt?: Date): string {
  if (!startAt || !endAt) return '';
  const diffMs = endAt.getTime() - startAt.getTime();
  if (diffMs <= 0) return '';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === 'in_progress') return <Loader2 className="w-4 h-4 text-indigo-500 shrink-0 animate-spin" />;
  return <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />;
}

function StatusBadge({ status }: { status: TodoStatus }) {
  if (status === 'done')
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
        Done
      </span>
    );
  if (status === 'in_progress')
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
        In Progress
      </span>
    );
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
      Pending
    </span>
  );
}

function PhaseCard({
  phase,
  index,
  totalPhases,
  todoMap,
  availableTodos,
  onUpdateTitle,
  onRemove,
  onMove,
  onAddTodo,
  onRemoveTodo,
  onMoveTodo,
  onUpdateTimes,
}: {
  phase: import('../types').RoadmapPhase;
  index: number;
  totalPhases: number;
  todoMap: Map<string, { title: string; status: TodoStatus; estimatedMinutes: number }>;
  availableTodos: import('../types').Todo[];
  onUpdateTitle: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onAddTodo: (phaseId: string, todoId: string) => void;
  onRemoveTodo: (phaseId: string, todoId: string) => void;
  onMoveTodo: (phaseId: string, todoId: string, dir: 'up' | 'down') => void;
  onUpdateTimes: (phaseId: string, startAt?: Date, endAt?: Date) => void;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(phase.title);
  const [showTodoPicker, setShowTodoPicker] = useState(false);

  const todosInPhase = phase.todoIds
    .map((id) => ({ id, ...todoMap.get(id) }))
    .filter((t) => t.title) as { id: string; title: string; status: TodoStatus; estimatedMinutes: number }[];

  const doneCount = todosInPhase.filter((t) => t.status === 'done').length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Phase header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />

        {isEditingTitle ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => {
              onUpdateTitle(phase.id, editTitle);
              setIsEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdateTitle(phase.id, editTitle);
                setIsEditingTitle(false);
              }
            }}
            autoFocus
            className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-b border-indigo-300 focus:outline-none text-slate-800 dark:text-slate-200"
          />
        ) : (
          <button
            onClick={() => {
              setEditTitle(phase.title);
              setIsEditingTitle(true);
            }}
            className="flex-1 min-w-0 text-left text-sm font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
          >
            {phase.title}
          </button>
        )}

        <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
          {doneCount}/{todosInPhase.length}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onMove(phase.id, 'up')}
            disabled={index === 0}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMove(phase.id, 'down')}
            disabled={index === totalPhases - 1}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove(phase.id)}
            className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-400 hover:text-rose-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Phase time range */}
      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="datetime-local"
            value={toDateTimeLocal(phase.startAt)}
            onChange={(e) =>
              onUpdateTimes(phase.id, fromDateTimeLocal(e.target.value), phase.endAt)
            }
            className="min-w-0 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-xs text-slate-400">→</span>
          <input
            type="datetime-local"
            value={toDateTimeLocal(phase.endAt)}
            onChange={(e) =>
              onUpdateTimes(phase.id, phase.startAt, fromDateTimeLocal(e.target.value))
            }
            className="min-w-0 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {phase.startAt && phase.endAt && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">
              ({formatPhaseDuration(phase.startAt, phase.endAt)})
            </span>
          )}
        </div>
      </div>

      {/* Todo list */}
      <div className="p-3 space-y-2">
        {todosInPhase.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-3 text-center">
            No todos in this phase yet.
          </p>
        )}

        {todosInPhase.map((todo, todoIndex) => (
          <div
            key={todo.id}
            className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors group"
          >
            <StatusIcon status={todo.status} />
            <span className="flex-1 min-w-0 text-sm truncate text-slate-700 dark:text-slate-300">
              {todo.title}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {todo.estimatedMinutes > 0 && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {formatDuration(todo.estimatedMinutes)}
                </span>
              )}
              <StatusBadge status={todo.status} />
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  onClick={() => onMoveTodo(phase.id, todo.id, 'up')}
                  disabled={todoIndex === 0}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 disabled:opacity-30"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onMoveTodo(phase.id, todo.id, 'down')}
                  disabled={todoIndex === todosInPhase.length - 1}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 disabled:opacity-30"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onRemoveTodo(phase.id, todo.id)}
                  className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-400 hover:text-rose-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Add todo */}
        <div className="pt-1">
          {showTodoPicker ? (
            <div className="flex items-center gap-2">
              <select
                autoFocus
                onChange={(e) => {
                  if (e.target.value) {
                    onAddTodo(phase.id, e.target.value);
                    setShowTodoPicker(false);
                  }
                }}
                className="flex-1 min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a todo...</option>
                {availableTodos
                  .filter((t) => !phase.todoIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => setShowTodoPicker(false)}
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTodoPicker(true)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Todo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Roadmap() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    roadmap,
    isLoading,
    goalTitle,
    addPhase,
    removePhase,
    updatePhaseTitle,
    updatePhaseTimes,
    movePhase,
    addTodoToPhase,
    removeTodoFromPhase,
    moveTodoInPhase,
    resetRoadmap,
  } = useRoadmapEditor(id);

  const { todos } = useTodos();

  const todoMap = useMemo(() => {
    const map = new Map<
      string,
      { title: string; status: TodoStatus; estimatedMinutes: number }
    >();
    for (const t of todos) {
      map.set(t.id, {
        title: t.title,
        status: t.status,
        estimatedMinutes: t.estimatedMinutes,
      });
    }
    return map;
  }, [todos]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
        Loading roadmap...
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        <MapIcon className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">Roadmap not found.</p>
        <button
          onClick={() => navigate('/today')}
          className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Back to Today
        </button>
      </div>
    );
  }

  const allPhaseTodos = roadmap.phases.flatMap((p) => p.todoIds);
  const totalTodos = allPhaseTodos.length;
  const doneTodos = allPhaseTodos.filter(
    (tid) => todoMap.get(tid)?.status === 'done'
  ).length;
  const totalMinutes = allPhaseTodos.reduce(
    (sum, tid) => sum + (todoMap.get(tid)?.estimatedMinutes ?? 0),
    0
  );
  const progressPct = totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/todo/${roadmap.goalTodoId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Todo
        </button>

        <div className="flex items-center gap-3 mb-2">
          <MapIcon className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Roadmap
          </h1>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          How to achieve:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {goalTitle}
          </span>
        </p>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {doneTodos} of {totalTodos} todos completed
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {progressPct}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {totalMinutes > 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Total estimated time: {formatDuration(totalMinutes)}
            </p>
          )}
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-4">
        {roadmap.phases.map((phase, index) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            index={index}
            totalPhases={roadmap.phases.length}
            todoMap={todoMap}
            availableTodos={todos}
            onUpdateTitle={updatePhaseTitle}
            onRemove={removePhase}
            onMove={movePhase}
            onAddTodo={addTodoToPhase}
            onRemoveTodo={removeTodoFromPhase}
            onMoveTodo={moveTodoInPhase}
            onUpdateTimes={updatePhaseTimes}
          />
        ))}
      </div>

      {/* Add phase */}
      <div className="mt-6">
        <button
          onClick={() => addPhase()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Phase
        </button>
      </div>

      {/* Empty state */}
      {roadmap.phases.length === 0 && (
        <div className="text-center mt-8">
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">
            No phases yet. Add phases and organize todos into an execution plan.
          </p>
        </div>
      )}

      {/* Reset */}
      {roadmap.phases.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => {
              if (confirm('Clear all phases? This cannot be undone.')) {
                resetRoadmap();
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Roadmap
          </button>
        </div>
      )}
    </div>
  );
}
