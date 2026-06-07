import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Plus,
  Trash2,
  Timer,
  ChevronUp,
  ChevronDown,
  X,
  Save,
  Edit2,
  Clock,
  Repeat,
  ArrowRight,
  ListTodo,
  Zap,
} from 'lucide-react';
import type { Pluse, Todo } from '../types';
import { getAllPluses, createPluse, deletePluse, updatePluse } from '../db/pluse';
import { getAllTodos } from '../db/todos';
import { formatSeconds } from '../utils/date';

/* ---------- Helpers ---------- */
function calcTotalSeconds(intervals: number[], repeatCount: number): number {
  return intervals.reduce((s, d) => s + d, 0) * repeatCount;
}

function calcIntervalCount(intervals: number[], repeatCount: number): number {
  return intervals.length * repeatCount;
}

function secondsToParts(seconds: number): { minutes: number; seconds: number } {
  return { minutes: Math.floor(seconds / 60), seconds: seconds % 60 };
}

function partsToSeconds(minutes: number, seconds: number): number {
  return Math.max(1, minutes * 60 + seconds);
}

/* ---------- Interval Editor ---------- */
function IntervalEditor({
  intervals,
  onChange,
}: {
  intervals: number[];
  onChange: (intervals: number[]) => void;
}) {
  function updateInterval(index: number, minutes: number, seconds: number) {
    const next = [...intervals];
    next[index] = partsToSeconds(minutes, seconds);
    onChange(next);
  }

  function removeInterval(index: number) {
    onChange(intervals.filter((_, i) => i !== index));
  }

  function moveInterval(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= intervals.length) return;
    const next = [...intervals];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addInterval() {
    onChange([...intervals, 1500]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {intervals.map((duration, idx) => {
          const parts = secondsToParts(duration);
          return (
            <div
              key={idx}
              className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5"
            >
              <input
                type="number"
                min={0}
                max={999}
                value={parts.minutes}
                onChange={(e) => updateInterval(idx, parseInt(e.target.value) || 0, parts.seconds)}
                className="w-8 text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none text-center"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">m</span>
              <input
                type="number"
                min={0}
                max={59}
                value={parts.seconds}
                onChange={(e) => {
                  const s = parseInt(e.target.value) || 0;
                  updateInterval(idx, parts.minutes, Math.min(59, Math.max(0, s)));
                }}
                className="w-7 text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none text-center"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">s</span>
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => moveInterval(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-slate-500 disabled:opacity-30 transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveInterval(idx, 1)}
                  disabled={idx === intervals.length - 1}
                  className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-slate-500 disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => removeInterval(idx)}
                  disabled={intervals.length <= 1}
                  className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 disabled:opacity-30 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {idx < intervals.length - 1 && (
                <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600 ml-1" />
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={addInterval}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add interval
      </button>
    </div>
  );
}

/* ---------- Interval Todo Bindings ---------- */
function IntervalTodoBindings({
  intervals,
  intervalTodos,
  todos,
  onChange,
}: {
  intervals: number[];
  intervalTodos: Record<number, string>;
  todos: Todo[];
  onChange: (bindings: Record<number, string>) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function setBinding(idx: number, todoId: string | null) {
    const next = { ...intervalTodos };
    if (todoId) {
      next[idx] = todoId;
    } else {
      delete next[idx];
    }
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      {intervals.map((duration, idx) => {
        const todoId = intervalTodos[idx];
        const todo = todoId ? todos.find((t) => t.id === todoId) : undefined;
        const isOpen = openIdx === idx;

        return (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 w-14 shrink-0">
              Interval {idx + 1}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 w-14 shrink-0">
              {formatSeconds(duration)}
            </span>
            <div className="relative flex-1 min-w-0" ref={isOpen ? ref : undefined}>
              {todo ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 truncate">
                    {todo.title}
                  </span>
                  <button
                    onClick={() => setBinding(idx, null)}
                    className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-indigo-500 transition-colors"
                >
                  + Bind todo
                </button>
              )}
              {isOpen && (
                <div className="absolute z-20 mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {todos.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">No todos</div>
                  ) : (
                    todos.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setBinding(idx, t.id);
                          setOpenIdx(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors truncate"
                      >
                        {t.title}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Pluse Editor ---------- */
function PluseEditor({
  name,
  description,
  intervals,
  repeatCount,
  intervalTodos,
  autoAdvance,
  todos,
  onNameChange,
  onDescriptionChange,
  onIntervalsChange,
  onRepeatCountChange,
  onIntervalTodosChange,
  onAutoAdvanceChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  name: string;
  description: string;
  intervals: number[];
  repeatCount: number;
  intervalTodos: Record<number, string>;
  autoAdvance: boolean;
  todos: Todo[];
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onIntervalsChange: (v: number[]) => void;
  onRepeatCountChange: (v: number) => void;
  onIntervalTodosChange: (v: Record<number, string>) => void;
  onAutoAdvanceChange: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Pluse name..."
          autoFocus
          className="w-full text-base font-medium bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description (optional)"
          className="w-full text-sm bg-transparent text-slate-600 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Intervals</label>
        <IntervalEditor intervals={intervals} onChange={onIntervalsChange} />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Repeat</label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">×</span>
          <input
            type="number"
            min={1}
            max={50}
            value={repeatCount}
            onChange={(e) => onRepeatCountChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-10 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-900 dark:text-slate-100 focus:outline-none text-center"
          />
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {formatSeconds(calcTotalSeconds(intervals, repeatCount))} total
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onAutoAdvanceChange(!autoAdvance)}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            autoAdvance
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
          title={autoAdvance ? 'Intervals auto-advance when time is up' : 'Timer stops at end of each interval'}
        >
          <Zap className="w-3 h-3" />
          {autoAdvance ? 'Auto advance on' : 'Auto advance off'}
        </button>
      </div>

      {todos.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Interval Actions
          </label>
          <IntervalTodoBindings
            intervals={intervals}
            intervalTodos={intervalTodos}
            todos={todos}
            onChange={onIntervalTodosChange}
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={onSave}
          disabled={!name.trim() || intervals.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- Pluse Card ---------- */
function PluseCard({
  pluse,
  todos,
  onDelete,
  onStart,
  onUpdate,
}: {
  pluse: Pluse;
  todos: Todo[];
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'intervalTodos' | 'autoAdvance'>>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(pluse.name);
  const [editDesc, setEditDesc] = useState(pluse.description);
  const [editIntervals, setEditIntervals] = useState([...pluse.intervals]);
  const [editRepeatCount, setEditRepeatCount] = useState(pluse.repeatCount);
  const [editIntervalTodos, setEditIntervalTodos] = useState<Record<number, string>>(
    pluse.intervalTodos ?? {}
  );
  const [editAutoAdvance, setEditAutoAdvance] = useState(pluse.autoAdvance ?? true);

  const totalSeconds = calcTotalSeconds(pluse.intervals, pluse.repeatCount);
  const intervalCount = calcIntervalCount(pluse.intervals, pluse.repeatCount);

  function handleSaveEdit() {
    if (!editName.trim() || editIntervals.length === 0) return;
    onUpdate(pluse.id, {
      name: editName.trim(),
      description: editDesc.trim(),
      intervals: [...editIntervals],
      repeatCount: editRepeatCount,
      intervalTodos: editIntervalTodos,
      autoAdvance: editAutoAdvance,
    });
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <PluseEditor
          name={editName}
          description={editDesc}
          intervals={editIntervals}
          repeatCount={editRepeatCount}
          intervalTodos={editIntervalTodos}
          autoAdvance={editAutoAdvance}
          todos={todos}
          onNameChange={setEditName}
          onDescriptionChange={setEditDesc}
          onIntervalsChange={setEditIntervals}
          onRepeatCountChange={setEditRepeatCount}
          onIntervalTodosChange={setEditIntervalTodos}
          onAutoAdvanceChange={setEditAutoAdvance}
          onSave={handleSaveEdit}
          onCancel={() => {
            setIsEditing(false);
            setEditName(pluse.name);
            setEditDesc(pluse.description);
            setEditIntervals([...pluse.intervals]);
            setEditRepeatCount(pluse.repeatCount);
            setEditIntervalTodos(pluse.intervalTodos ?? {});
            setEditAutoAdvance(pluse.autoAdvance ?? true);
          }}
          saveLabel="Save"
        />
      </div>
    );
  }

  const boundCount = Object.keys(pluse.intervalTodos ?? {}).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {pluse.name}
          </h3>
          {pluse.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {pluse.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatSeconds(totalSeconds)} total
            </span>
            <span>{intervalCount} intervals</span>
            {pluse.repeatCount > 1 && (
              <span className="flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                ×{pluse.repeatCount}
              </span>
            )}
            {boundCount > 0 && (
              <span className="flex items-center gap-1 text-indigo-500">
                <ListTodo className="w-3 h-3" />
                {boundCount} bound
              </span>
            )}
            {(pluse.autoAdvance ?? true) === false && (
              <span className="flex items-center gap-1 text-amber-500">
                <Zap className="w-3 h-3" />
                Manual
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-indigo-500 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(pluse.id)}
            className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interval preview */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {pluse.intervals.map((duration, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              <Clock className="w-2.5 h-2.5" />
              {formatSeconds(duration)}
            </span>
            {idx < pluse.intervals.length - 1 && (
              <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
            )}
          </div>
        ))}
        {pluse.repeatCount > 1 && (
          <>
            <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800/30">
              <Repeat className="w-2.5 h-2.5" />
              ×{pluse.repeatCount}
            </span>
          </>
        )}
      </div>

      <button
        onClick={() => onStart(pluse.id)}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        <Play className="w-4 h-4" />
        Start Pluse
      </button>
    </div>
  );
}

/* ---------- Main Page ---------- */
export function PluseList() {
  const navigate = useNavigate();
  const [pluses, setPluses] = useState<Pluse[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIntervals, setNewIntervals] = useState<number[]>([1500, 300]);
  const [newRepeatCount, setNewRepeatCount] = useState(1);
  const [newIntervalTodos, setNewIntervalTodos] = useState<Record<number, string>>({});
  const [newAutoAdvance, setNewAutoAdvance] = useState(true);

  const loadData = useCallback(async () => {
    const [allPluses, allTodos] = await Promise.all([getAllPluses(), getAllTodos()]);
    setPluses(allPluses);
    setTodos(allTodos);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => loadData(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [loadData]);

  async function handleCreate() {
    if (!newName.trim() || newIntervals.length === 0) return;
    await createPluse(
      newName.trim(),
      [...newIntervals],
      newRepeatCount,
      newDesc.trim(),
      Object.keys(newIntervalTodos).length > 0 ? newIntervalTodos : undefined,
      newAutoAdvance
    );
    setNewName('');
    setNewDesc('');
    setNewIntervals([1500, 300]);
    setNewRepeatCount(1);
    setNewIntervalTodos({});
    setNewAutoAdvance(true);
    setIsCreating(false);
    await loadData();
  }

  async function handleDelete(id: string) {
    await deletePluse(id);
    await loadData();
  }

  async function handleUpdate(
    id: string,
    updates: Partial<Pick<Pluse, 'name' | 'description' | 'intervals' | 'repeatCount' | 'intervalTodos' | 'autoAdvance'>>
  ) {
    await updatePluse(id, updates);
    await loadData();
  }

  if (isLoading) {
    return <div className="text-slate-500 dark:text-slate-400">Loading...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Pluse</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Reusable timer templates with interval sequences
        </p>
      </div>

      {/* Create new */}
      {!isCreating ? (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create a new pluse
        </button>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <PluseEditor
            name={newName}
            description={newDesc}
            intervals={newIntervals}
            repeatCount={newRepeatCount}
            intervalTodos={newIntervalTodos}
            autoAdvance={newAutoAdvance}
            todos={todos}
            onNameChange={setNewName}
            onDescriptionChange={setNewDesc}
            onIntervalsChange={setNewIntervals}
            onRepeatCountChange={setNewRepeatCount}
            onIntervalTodosChange={setNewIntervalTodos}
            onAutoAdvanceChange={setNewAutoAdvance}
            onSave={handleCreate}
            onCancel={() => {
              setIsCreating(false);
              setNewName('');
              setNewDesc('');
              setNewIntervals([1500, 300]);
              setNewRepeatCount(1);
              setNewIntervalTodos({});
              setNewAutoAdvance(true);
            }}
            saveLabel="Create Pluse"
          />
        </div>
      )}

      {/* List */}
      {pluses.length === 0 && !isCreating ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto">
            <Timer className="w-7 h-7 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-slate-100">
            No pluses yet
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create your first pluse to start a focused work session.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pluses.map((pluse) => (
            <PluseCard
              key={pluse.id}
              pluse={pluse}
              todos={todos}
              onDelete={handleDelete}
              onStart={(id) => navigate(`/pluse/${id}/run`)}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
