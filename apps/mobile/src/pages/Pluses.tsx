import { useState, useCallback, useEffect } from 'react';
import {
  Timer,
  Trash2,
  Plus,
  X,
  Save,
  ChevronUp,
  ChevronDown,
  Zap,
} from 'lucide-react';
import type { Pluse } from '@utral/types';
import { getAllPluses, createPluse, deletePluse, updatePluse } from '../db/pluse';
import { nativeHaptic } from '../bridge/native';

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function calcTotalSeconds(intervals: number[], repeatCount: number): number {
  return intervals.reduce((s, d) => s + d, 0) * repeatCount;
}

/* ─── Pluse Editor ─── */

function PluseEditor({
  initialPluse,
  onSave,
  onCancel,
}: {
  initialPluse?: Pluse;
  onSave: (pluse: { name: string; intervals: number[]; repeatCount: number; autoAdvance: boolean }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialPluse?.name ?? '');
  const [intervals, setIntervals] = useState<number[]>(initialPluse?.intervals ?? [1500]);
  const [repeatCount, setRepeatCount] = useState(initialPluse?.repeatCount ?? 1);
  const [autoAdvance, setAutoAdvance] = useState(initialPluse?.autoAdvance ?? true);

  function updateIntervalMinutes(index: number, minutes: number) {
    const next = [...intervals];
    const secs = intervals[index] % 60;
    next[index] = Math.max(1, minutes * 60 + secs);
    setIntervals(next);
  }

  function updateIntervalSeconds(index: number, seconds: number) {
    const next = [...intervals];
    const mins = Math.floor(intervals[index] / 60);
    next[index] = Math.max(1, mins * 60 + seconds);
    setIntervals(next);
  }

  function moveInterval(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= intervals.length) return;
    const next = [...intervals];
    [next[index], next[target]] = [next[target], next[index]];
    setIntervals(next);
  }

  function removeInterval(index: number) {
    if (intervals.length <= 1) return;
    setIntervals(intervals.filter((_, i) => i !== index));
  }

  function addInterval() {
    setIntervals([...intervals, 1500]);
  }

  const isValid = name.trim() && intervals.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pluse name..."
        autoFocus
        className="w-full text-base font-medium bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
      />

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Intervals</label>
        <div className="space-y-2">
          {intervals.map((duration, idx) => {
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 dark:text-slate-500 w-16">
                  Interval {idx + 1}
                </span>
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={minutes}
                    onChange={(e) => updateIntervalMinutes(idx, parseInt(e.target.value) || 0)}
                    className="w-10 text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none text-center"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">min</span>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={(e) => updateIntervalSeconds(idx, parseInt(e.target.value) || 0)}
                    className="w-10 text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none text-center"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">sec</span>
                </div>
                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    onClick={() => moveInterval(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-slate-300 dark:text-slate-600 active:text-slate-500 disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveInterval(idx, 1)}
                    disabled={idx === intervals.length - 1}
                    className="p-1 text-slate-300 dark:text-slate-600 active:text-slate-500 disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeInterval(idx)}
                    disabled={intervals.length <= 1}
                    className="p-1 text-slate-300 dark:text-slate-600 active:text-rose-500 disabled:opacity-30 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={addInterval}
          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add interval
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Repeat</label>
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-400 dark:text-slate-500">×</span>
            <input
              type="number"
              min={1}
              max={50}
              value={repeatCount}
              onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-8 text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none text-center"
            />
          </div>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {formatSeconds(calcTotalSeconds(intervals, repeatCount))} total
        </span>
      </div>

      <button
        onClick={() => setAutoAdvance(!autoAdvance)}
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
          autoAdvance
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 active:bg-slate-50 dark:active:bg-slate-700'
        }`}
      >
        <Zap className="w-3 h-3" />
        {autoAdvance ? 'Auto advance on' : 'Auto advance off'}
      </button>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={() => onSave({ name: name.trim(), intervals, repeatCount, autoAdvance })}
          disabled={!isValid}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white px-4 py-2 rounded-xl active:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {initialPluse ? 'Save' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-slate-500 dark:text-slate-400 active:text-slate-700 dark:active:text-slate-300 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Pluse Card ─── */

function PluseCard({
  pluse,
  onDelete,
  onEdit,
}: {
  pluse: Pluse;
  onDelete: (id: string) => void;
  onEdit: (pluse: Pluse) => void;
}) {
  const totalSeconds = calcTotalSeconds(pluse.intervals, pluse.repeatCount);
  const intervalCount = pluse.intervals.length * pluse.repeatCount;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{pluse.name}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {formatSeconds(totalSeconds)}
            </span>
            <span>{intervalCount} intervals</span>
            {pluse.repeatCount > 1 && <span>×{pluse.repeatCount}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {pluse.intervals.map((dur, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
              >
                {formatSeconds(dur)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(pluse)}
            className="p-1.5 text-slate-400 dark:text-slate-500 active:text-indigo-500 transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this pluse?')) {
                onDelete(pluse.id);
              }
            }}
            className="p-1.5 text-slate-400 dark:text-slate-500 active:text-rose-500 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  );
}

/* ─── Main Page ─── */

export function Pluses() {
  const [pluses, setPluses] = useState<Pluse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const all = await getAllPluses();
    setPluses(all);
    setIsLoading(false);
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

  async function handleCreate(data: { name: string; intervals: number[]; repeatCount: number; autoAdvance: boolean }) {
    await createPluse(data.name, data.intervals, data.repeatCount, '', data.autoAdvance);
    setIsCreating(false);
    nativeHaptic.impact('light').catch(() => {});
    await load();
  }

  async function handleEdit(data: { name: string; intervals: number[]; repeatCount: number; autoAdvance: boolean }) {
    if (!editingId) return;
    await updatePluse(editingId, data);
    setEditingId(null);
    nativeHaptic.impact('light').catch(() => {});
    await load();
  }

  async function handleDelete(id: string) {
    await deletePluse(id);
    nativeHaptic.impact('medium').catch(() => {});
    await load();
  }

  const editingPluse = editingId ? pluses.find((p) => p.id === editingId) : undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Create new */}
      {!isCreating && !editingId ? (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 text-sm text-slate-500 dark:text-slate-400 active:border-indigo-400 dark:active:border-indigo-500 active:text-indigo-600 dark:active:text-indigo-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create a new pluse
        </button>
      ) : (
        <PluseEditor
          initialPluse={editingPluse}
          onSave={editingId ? handleEdit : handleCreate}
          onCancel={() => {
            setIsCreating(false);
            setEditingId(null);
          }}
        />
      )}

      {/* List */}
      {pluses.length === 0 && !isCreating && !editingId ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto">
            <Timer className="w-7 h-7 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-slate-100">No pluses yet</h3>
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
              onDelete={handleDelete}
              onEdit={(p) => setEditingId(p.id)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
