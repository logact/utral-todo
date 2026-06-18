import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, Zap, Target, Play, Pause, SkipForward, RotateCcw, X, ChevronDown, Timer, ArrowRight, Search, Sparkles } from 'lucide-react';
import { getTodaysTodos, getInProgressTodos, getOverdueTodos, getAllTodos, updateTodoStatus } from '../db/todos';
import { getAllPluses } from '../db/pluse';
import { getActiveTimerSession, updateTimerSession } from '../db/timerSessions';
import type { Todo, Pluse, TimerSession } from '@utral/types';
import { nativeHaptic } from '../bridge/native';

/* ─── Helpers ─── */

function expandIntervals(intervals: number[], repeatCount: number): number[] {
  const result: number[] = [];
  for (let r = 0; r < repeatCount; r++) {
    result.push(...intervals);
  }
  return result;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ─── Active Session Resume Card ─── */

function ActiveSessionCard({
  session,
  pluses,
  tick,
  onResume,
  onPause,
  onStop,
  onTapTimer,
}: {
  session: TimerSession;
  pluses: Pluse[];
  tick: number;
  onResume: () => void;
  onPause: () => void;
  onStop: () => void;
  onTapTimer: () => void;
}) {
  const pluse = pluses.find((p) => p.id === session.pluseId);
  const expanded = session.intervals ? expandIntervals(session.intervals, session.repeatCount) : [];
  const currentDuration = expanded[session.currentIndex] || 0;

  // tick prop ensures re-render every second for live countdown
  const startedAt = new Date(session.startedAt);
  const elapsed =
    session.status === 'running'
      ? session.elapsedSeconds + Math.floor((Date.now() - startedAt.getTime()) / 1000)
      : session.elapsedSeconds;
  void tick;
  const remainingSeconds = Math.max(0, currentDuration - elapsed);
  const totalItems = expanded.length;

  return (
    <div className="text-center space-y-3 py-4 px-4">
      <div className="flex items-center justify-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${session.status === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'}`} />
        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
          {session.status === 'running' ? 'Focus in Progress' : 'Focus Paused'}
        </span>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {pluse?.name ?? session.name}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          Interval {session.currentIndex + 1} of {totalItems}
        </p>
      </div>

      <button
        onClick={onTapTimer}
        className="text-4xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight active:scale-95 transition-transform"
      >
        {formatCountdown(remainingSeconds)}
      </button>

      <div className="flex items-center justify-center gap-2">
        {session.status === 'running' ? (
          <button
            onClick={onPause}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 active:bg-amber-100 dark:active:bg-amber-950/50 transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        ) : (
          <button
            onClick={onResume}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-medium bg-indigo-600 text-white active:bg-indigo-700 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        )}
        <button
          onClick={onStop}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Stop
        </button>
      </div>
    </div>
  );
}

/* ─── Pluse Mini Timer ─── */

function PluseMiniTimer({
  pluse,
  onClose,
  onRequireTask,
}: {
  pluse: Pluse;
  onClose: () => void;
  onRequireTask: (pluse: Pluse) => void;
}) {
  const expandedIntervals = expandIntervals(pluse.intervals, pluse.repeatCount);
  const totalItems = expandedIntervals.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceTick] = useState(0);

  const currentDuration = expandedIntervals[currentIndex] || 0;

  const getElapsed = useCallback(() => {
    if (!isRunning || !startTime) return elapsedSeconds;
    return elapsedSeconds + Math.floor((Date.now() - startTime) / 1000);
  }, [isRunning, elapsedSeconds, startTime]);

  const elapsed = getElapsed();
  const remainingSeconds = Math.max(0, currentDuration - elapsed);

  // Tick every second while running
  useEffect(() => {
    if (!isRunning || isCompleted) return;
    intervalRef.current = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, isCompleted]);

  // Clear pending auto-advance timeout when user explicitly starts running
  useEffect(() => {
    if (isRunning && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isRunning]);

  // Unmount: clear any pending timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Check completion / auto-advance
  useEffect(() => {
    if (isCompleted || !isRunning) return;
    const shouldAutoAdvance = pluse.autoAdvance !== false;
    if (elapsed >= currentDuration && currentDuration > 0) {
      nativeHaptic.notification('success').catch(() => {});
      if (currentIndex < totalItems - 1) {
        const nextIndex = currentIndex + 1;
        setIsRunning(false);
        setCurrentIndex(nextIndex);
        setElapsedSeconds(0);
        setStartTime(null);

        if (shouldAutoAdvance) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            setIsRunning(true);
            setStartTime(Date.now());
            nativeHaptic.impact('light').catch(() => {});
          }, 2000);
        }
      } else {
        setIsRunning(false);
        setIsCompleted(true);
        setStartTime(null);
        nativeHaptic.notification('success').catch(() => {});
      }
    }
  }, [elapsed, isRunning, isCompleted, currentIndex, totalItems, currentDuration, pluse]);

  const toggleRunning = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isCompleted) {
      onRequireTask(pluse);
      return;
    }

    if (isRunning) {
      const total = elapsedSeconds + (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
      setIsRunning(false);
      setElapsedSeconds(total);
      setStartTime(null);
    } else {
      if (elapsedSeconds === 0 && currentIndex === 0) {
        onRequireTask(pluse);
        return;
      }
      setIsRunning(true);
      setStartTime(Date.now());
    }
    nativeHaptic.impact('light').catch(() => {});
  }, [isRunning, isCompleted, elapsedSeconds, startTime, currentIndex, pluse, onRequireTask]);

  const skipToNext = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (currentIndex >= totalItems - 1) return;
    const nextIndex = currentIndex + 1;
    setIsRunning(false);
    setCurrentIndex(nextIndex);
    setElapsedSeconds(0);
    setStartTime(null);
    nativeHaptic.impact('medium').catch(() => {});
  }, [currentIndex, totalItems]);

  const restart = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    setStartTime(null);
    nativeHaptic.impact('medium').catch(() => {});
  }, []);

  if (isCompleted) {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Done!
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {pluse.name} complete
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={restart}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 text-white active:bg-indigo-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Again
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-3 py-2">
      <div className="text-4xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        {formatCountdown(remainingSeconds)}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        Interval {currentIndex + 1} of {totalItems} · {formatSeconds(currentDuration)}
      </div>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={toggleRunning}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors active:scale-95 ${
            isRunning
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
              : 'bg-indigo-600 text-white active:bg-indigo-700'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              {elapsed > 0 ? 'Resume' : 'Start'}
            </>
          )}
        </button>

        <button
          onClick={skipToNext}
          disabled={currentIndex >= totalItems - 1}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip
        </button>

        {elapsed > 0 && (
          <button
            onClick={restart}
            className="p-2 rounded-xl text-slate-400 dark:text-slate-500 active:text-slate-600 dark:active:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
            title="Restart"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 dark:text-slate-500 active:text-slate-600 dark:active:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Pluse Selector ─── */

function PluseSelector({
  pluses,
  activeId,
  onSelect,
}: {
  pluses: Pluse[];
  activeId: string;
  onSelect: (pluse: Pluse) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = pluses.find((p) => p.id === activeId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center gap-1 w-full text-[11px] text-slate-500 dark:text-slate-400 active:text-slate-700 dark:active:text-slate-300 transition-colors"
      >
        {active?.name ?? 'Select pluse'}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden"
        >
          {pluses.map((pluse) => {
            const totalSeconds = pluse.intervals.reduce((s, d) => s + d, 0) * pluse.repeatCount;
            const isActive = pluse.id === activeId;
            return (
              <button
                key={pluse.id}
                onClick={() => {
                  onSelect(pluse);
                  setOpen(false);
                }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-[11px] transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                    : 'text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-800'
                }`}
              >
                <span className="flex-1 truncate">{pluse.name}</span>
                <span className="text-slate-400 dark:text-slate-500 shrink-0">{formatSeconds(totalSeconds)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Focus Session Starter Modal ─── */

function FocusStarterModal({
  pluses,
  onCancel,
  initialPluse,
  initialTodoId,
}: {
  pluses: Pluse[];
  onCancel: () => void;
  initialPluse?: Pluse;
  initialTodoId?: string;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'pluse' | 'todo'>(initialPluse ? 'todo' : 'pluse');
  const [selectedPluse, setSelectedPluse] = useState<Pluse | null>(initialPluse ?? null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Auto-navigate if both pluse and todo are pre-selected
  useEffect(() => {
    if (initialPluse && initialTodoId) {
      navigate(`/pluse/${initialPluse.id}/run?todoId=${initialTodoId}`);
    }
  }, [initialPluse, initialTodoId, navigate]);

  // If only one pluse and no pre-selected todo, skip to todo picker
  useEffect(() => {
    if (pluses.length === 1 && !initialPluse) {
      setSelectedPluse(pluses[0]);
      setStep('todo');
    }
  }, [pluses, initialPluse]);

  useEffect(() => {
    getAllTodos().then((all) => {
      const pending = all.filter((t) => t.status === 'pending');
      setTodos(pending);
      setLoading(false);
    });
  }, []);

  const filtered = filter.trim()
    ? todos.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()))
    : todos;

  function selectPluse(pluse: Pluse) {
    nativeHaptic.impact('light').catch(() => {});
    if (initialTodoId) {
      navigate(`/pluse/${pluse.id}/run?todoId=${initialTodoId}`);
      return;
    }
    setSelectedPluse(pluse);
    setStep('todo');
  }

  function selectTodo(todoId: string) {
    if (!selectedPluse) return;
    nativeHaptic.impact('medium').catch(() => {});
    navigate(`/pluse/${selectedPluse.id}/run?todoId=${todoId}`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onCancel}>
      <div
        className="bg-white dark:bg-slate-900 rounded-t-2xl w-full max-w-lg p-4 pb-safe max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {step === 'pluse' ? 'Choose your pluse' : 'What will you focus on?'}
            </h2>
            {step === 'todo' && selectedPluse && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Starting <span className="font-medium text-indigo-600 dark:text-indigo-400">{selectedPluse.name}</span>
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Pluse picker */}
        {step === 'pluse' && (
          <div className="flex-1 overflow-auto space-y-2">
            {pluses.map((pluse) => {
              const totalSeconds = pluse.intervals.reduce((s, d) => s + d, 0) * pluse.repeatCount;
              return (
                <button
                  key={pluse.id}
                  onClick={() => selectPluse(pluse)}
                  className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
                    <Timer className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {pluse.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatSeconds(totalSeconds)} · {pluse.intervals.length * pluse.repeatCount} intervals
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Step: Todo picker */}
        {step === 'todo' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search */}
            <div className="relative mb-3 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search tasks..."
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 border-0 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-auto min-h-0 pb-4">
              {loading ? (
                <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">Loading...</div>
              ) : todos.length === 0 ? (
                <div className="text-center py-8">
                  <Target className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No pending tasks available.
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Add a task on this page first.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
                  No tasks match your search.
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((todo) => (
                    <button
                      key={todo.id}
                      onClick={() => selectTodo(todo.id)}
                      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                        <Target className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {todo.title}
                        </p>
                        {todo.scheduledDate && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            {new Date(todo.scheduledDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export function Today({ onQuickCreate }: { onQuickCreate?: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inProgress, setInProgress] = useState<Todo[]>([]);
  const [overdue, setOverdue] = useState<Todo[]>([]);
  const [pluses, setPluses] = useState<Pluse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePluse, setActivePluse] = useState<Pluse | null>(null);
  const [pluseKey, setPluseKey] = useState(0);
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [focusModalInitialPluse, setFocusModalInitialPluse] = useState<Pluse | undefined>(undefined);
  const [activeSession, setActiveSession] = useState<TimerSession | null>(null);
  const [sessionTick, setSessionTick] = useState(0);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setLoading(true);
    const [today, progress, overdueList, allPluses, session] = await Promise.all([
      getTodaysTodos(),
      getInProgressTodos(),
      getOverdueTodos(),
      getAllPluses(),
      getActiveTimerSession(),
    ]);
    setTodos(today);
    setInProgress(progress);
    setOverdue(overdueList);
    setPluses(allPluses);
    setActiveSession(session || null);
    if (allPluses.length > 0 && !activePluse) {
      setActivePluse(allPluses[0]);
    }
    setLoading(false);
  }, [activePluse]);

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when page becomes visible again (e.g., navigating back from PluseRun)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  // Refresh when remote sync data arrives
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

  async function toggleStatus(todo: Todo) {
    const newStatus = todo.status === 'done' ? 'pending' : 'done';
    await updateTodoStatus(todo.id, newStatus);
    nativeHaptic.impact('light').catch(() => {});
    refresh();
  }

  async function setFocus(todo: Todo) {
    await updateTodoStatus(todo.id, 'in_progress');
    nativeHaptic.impact('medium').catch(() => {});
    refresh();
  }

  const allTodos = [...overdue, ...inProgress, ...todos.filter((t) => t.status !== 'in_progress')];
  const doneCount = allTodos.filter((t) => t.status === 'done').length;
  const totalCount = allTodos.length;
  const currentTodo = inProgress[0];
  const pendingCount = allTodos.filter((t) => t.status === 'pending').length;

  function handleClosePluse() {
    setActivePluse(null);
  }

  function handleSelectPluse(pluse: Pluse) {
    setActivePluse(pluse);
    setPluseKey((k) => k + 1);
  }

  function handleStartFocus() {
    nativeHaptic.impact('light').catch(() => {});
    setFocusModalInitialPluse(undefined);
    setFocusModalOpen(true);
  }

  function handleRequireTask(pluse: Pluse) {
    nativeHaptic.impact('light').catch(() => {});
    setFocusModalInitialPluse(pluse);
    setFocusModalOpen(true);
  }

  function handleCloseFocusModal() {
    setFocusModalOpen(false);
    setFocusModalInitialPluse(undefined);
  }

  // Tick for active session display
  useEffect(() => {
    if (!activeSession || activeSession.status === 'completed') return;
    const interval = setInterval(() => setSessionTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  async function handleResumeSession() {
    if (!activeSession) return;
    await updateTimerSession(activeSession.id, {
      status: 'running',
      startedAt: new Date(),
      pausedAt: null,
    });
    setActiveSession({ ...activeSession, status: 'running', startedAt: new Date(), pausedAt: null });
    nativeHaptic.impact('medium').catch(() => {});
  }

  async function handlePauseSession() {
    if (!activeSession) return;
    const now = Date.now();
    const elapsed = activeSession.elapsedSeconds + Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000);
    await updateTimerSession(activeSession.id, {
      status: 'paused',
      pausedAt: new Date(),
      elapsedSeconds: elapsed,
    });
    setActiveSession({ ...activeSession, status: 'paused', pausedAt: new Date(), elapsedSeconds: elapsed });
    nativeHaptic.impact('medium').catch(() => {});
  }

  async function handleStopSession() {
    if (!activeSession) return;
    await updateTimerSession(activeSession.id, {
      status: 'completed',
      completedAt: new Date(),
    });
    setActiveSession(null);
    nativeHaptic.impact('medium').catch(() => {});
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              inProgress.length > 0
                ? 'bg-amber-400 animate-pulse'
                : totalCount > doneCount
                  ? 'bg-indigo-400'
                  : 'bg-emerald-400'
            }`}
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {inProgress.length > 0
              ? `${inProgress.length} in progress`
              : totalCount > doneCount
                ? `${totalCount - doneCount} left`
                : 'All done'}
          </span>
        </div>
        {doneCount > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {doneCount} done
          </span>
        )}
      </div>

      {/* Focus Session Card */}
      {pluses.length > 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {activeSession ? (
            <ActiveSessionCard
              session={activeSession}
              pluses={pluses}
              tick={sessionTick}
              onResume={handleResumeSession}
              onPause={handlePauseSession}
              onStop={handleStopSession}
              onTapTimer={() => navigate(`/pluse/${activeSession.pluseId}/run?todoId=${activeSession.todoId}`, { state: { session: activeSession } })}
            />
          ) : activePluse ? (
            <>
              <PluseMiniTimer
                key={`${activePluse.id}-${pluseKey}`}
                pluse={activePluse}
                onClose={handleClosePluse}
                onRequireTask={handleRequireTask}
              />
              {/* Pluse selector */}
              {pluses.length > 1 && (
                <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 relative">
                  <PluseSelector
                    pluses={pluses}
                    activeId={activePluse.id}
                    onSelect={handleSelectPluse}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-5 space-y-3">
              {pendingCount > 0 ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Ready to focus?
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {pendingCount} task{pendingCount > 1 ? 's' : ''} waiting
                    </p>
                  </div>
                  <button
                    onClick={handleStartFocus}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-5 py-2.5 rounded-xl bg-indigo-600 text-white active:bg-indigo-700 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Focus Session
                  </button>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      All caught up!
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      No pending tasks. Add one to start a focus session.
                    </p>
                  </div>
                  <button
                    onClick={onQuickCreate}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-5 py-2.5 rounded-xl bg-indigo-600 text-white active:bg-indigo-700 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Add a Task
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <Link
          to="/pluses"
          className="block bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 text-center active:border-indigo-400 dark:active:border-indigo-500 transition-colors"
        >
          <Timer className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto mb-1.5" />
          <p className="text-xs text-slate-500 dark:text-slate-400">No pluses yet</p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">Create your first pluse</p>
        </Link>
      )}

      {/* Current Task Card */}
      {currentTodo && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Current Focus
            </span>
          </div>
          <Link to={`/todo/${currentTodo.id}`}>
            <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">
              {currentTodo.title}
            </p>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleStatus(currentTodo)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 active:bg-emerald-100 dark:active:bg-emerald-900/40 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Mark done
            </button>
          </div>
        </div>
      )}

      {/* Todo list */}
      <div className="space-y-1">
        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {allTodos.length > 0 ? 'Tasks' : ''}
          </span>
        </div>
        {allTodos.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
              No tasks for today
            </p>
            <button
              onClick={onQuickCreate}
              className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 font-medium"
            >
              Add your first task
            </button>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Start a focus session right from here once you add tasks.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {allTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => toggleStatus(todo)}
                onFocus={() => setFocus(todo)}
              />
            ))}
            <div className="h-8" />
          </div>
        )}
      </div>

      {/* Focus Starter Modal */}
      {focusModalOpen && (
        <FocusStarterModal
          pluses={pluses}
          onCancel={handleCloseFocusModal}
          initialPluse={focusModalInitialPluse}
          initialTodoId={currentTodo?.id}
        />
      )}
    </div>
  );
}

function TodoItem({
  todo,
  onToggle,
  onFocus,
}: {
  todo: Todo;
  onToggle: () => void;
  onFocus?: () => void;
}) {
  const isDone = todo.status === 'done';
  const isInProgress = todo.status === 'in_progress';
  const canFocus = !isDone && !isInProgress;

  const priorityColor =
    todo.priority === 'high'
      ? 'text-rose-500'
      : todo.priority === 'medium'
        ? 'text-amber-500'
        : 'text-slate-400';

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-xl active:bg-slate-100 dark:active:bg-slate-800/50">
      <button onClick={onToggle} className="mt-0.5 shrink-0">
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
        )}
      </button>

      <Link to={`/todo/${todo.id}`} className="flex-1 min-w-0">
        <p
          className={`text-[15px] font-medium truncate ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {todo.scheduledDate && (
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Clock className="w-3 h-3" />
              {formatTime(todo.scheduledDate)}
            </span>
          )}
          <span className={`text-xs font-medium ${priorityColor}`}>
            {todo.priority}
          </span>
          {isInProgress && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Zap className="w-3 h-3" />
              In Progress
            </span>
          )}
        </div>
      </Link>

      {canFocus && onFocus && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          className="mt-0.5 shrink-0 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 active:text-amber-600 dark:active:text-amber-400 active:bg-amber-50 dark:active:bg-amber-950/30 transition-colors"
          title="Set as current focus"
        >
          <Target className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
