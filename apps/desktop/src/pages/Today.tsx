import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle2,
  Circle,
  Clock,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  X,
  ChevronDown,
  AlertTriangle,
  Zap,
  Flame,
  Sun,
  Sunset,
  Moon,
  Target,
  CalendarCheck,
  GripVertical,
} from 'lucide-react';
import { useTodayData } from '../hooks/useTodos';
import { getInProgressTodos, reorderTodos, getAllTodos } from '../db/todos';
import { getAllPluses } from '../db/pluse';
import { createTodoLog } from '../db/todoLogs';
import { traceSourceChain } from '../db/relations';
import {
  getTimerSessions,
  createTimerSession,
  updateTimerSession,
  deleteTimerSession,
} from '../db/timerSessions';
import { TodoExecutionPanel } from '../components/TodoExecutionPanel';
import {
  formatDuration,
  formatTime,
  formatSeconds,
  getTimeOfDay,
  type TimeOfDay,
} from '../utils/date';
import type { Todo, TodoStatus, Priority, Pluse } from '../types';

/* ─── Config ─── */

const priorityConfig: Record<
  Priority,
  { label: string; bg: string; text: string; darkBg: string; darkText: string }
> = {
  high: {
    label: 'High',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    darkBg: 'dark:bg-rose-950/30',
    darkText: 'dark:text-rose-400',
  },
  medium: {
    label: 'Med',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    darkBg: 'dark:bg-amber-950/30',
    darkText: 'dark:text-amber-400',
  },
  low: {
    label: 'Low',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    darkBg: 'dark:bg-slate-800',
    darkText: 'dark:text-slate-400',
  },
};

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

/* ─── Small Components ─── */

/* ─── TimerClock with server persistence ─── */

function TimerClock() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On mount: restore from server
  useEffect(() => {
    getTimerSessions({ type: 'stopwatch' }).then((sessions) => {
      const active = sessions.find((s) => s.status !== 'completed');
      if (!active) return;

      setSessionId(active.id);
      setRunning(active.status === 'running');

      if (active.status === 'running' && active.startedAt) {
        setElapsedSeconds(active.elapsedSeconds);
        setStartTime(active.startedAt.getTime());
      } else {
        setElapsedSeconds(active.elapsedSeconds);
        setStartTime(null);
      }
    });
  }, []);

  // Tick every second while running
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => forceTick((n) => n + 1), 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  const displayElapsed = useCallback(() => {
    if (!running || !startTime) return elapsedSeconds;
    return elapsedSeconds + Math.floor((Date.now() - startTime) / 1000);
  }, [running, elapsedSeconds, startTime]);

  const toggle = useCallback(async () => {
    if (running) {
      // Pause
      const total = displayElapsed();
      setRunning(false);
      setElapsedSeconds(total);
      setStartTime(null);
      if (sessionId) {
        await updateTimerSession(sessionId, {
          status: 'paused',
          elapsedSeconds: total,
          pausedAt: new Date(),
        });
      }
    } else {
      // Start / Resume
      setRunning(true);
      setStartTime(Date.now());
      if (sessionId) {
        await updateTimerSession(sessionId, {
          status: 'running',
          startedAt: new Date(),
        });
      } else {
        const session = await createTimerSession({
          type: 'stopwatch',
          name: 'Focus Timer',
          status: 'running',
          startedAt: new Date(),
        });
        setSessionId(session.id);
      }
    }
  }, [running, sessionId, elapsedSeconds, startTime, displayElapsed]);

  const reset = useCallback(async () => {
    if (sessionId) {
      await deleteTimerSession(sessionId);
    }
    setSessionId(null);
    setRunning(false);
    setElapsedSeconds(0);
    setStartTime(null);
  }, [sessionId]);

  const total = displayElapsed();
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const display = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <div className="px-4 pt-5 pb-3 text-center">
      <div className="text-5xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        {display}
      </div>
      <div className="flex items-center justify-center gap-3 mt-4">
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            running
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
          title={running ? 'Pause' : 'Start'}
        >
          {running ? (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              {total > 0 ? 'Resume' : 'Start'}
            </>
          )}
        </button>
        {total > 0 && (
          <button
            onClick={reset}
            className="p-2.5 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── PluseMiniTimer with server persistence ─── */

function PluseMiniTimer({
  pluse,
  onClose,
  onIntervalTodo,
}: {
  pluse: Pluse;
  onClose: () => void;
  onIntervalTodo?: (todoId: string | null) => void;
}) {
  const expandedIntervals = expandIntervals(pluse.intervals, pluse.repeatCount);
  const totalItems = expandedIntervals.length;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0); // elapsed within current interval
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);

  const [, forceTick] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load todos for interval bindings
  useEffect(() => {
    getAllTodos().then(setTodos);
  }, []);

  // Auto-switch todo when interval changes
  useEffect(() => {
    if (pluse.intervals.length === 0) return;
    const templateIndex = currentIndex % pluse.intervals.length;
    const boundTodoId = pluse.intervalTodos?.[templateIndex];
    if (boundTodoId && onIntervalTodo) {
      onIntervalTodo(boundTodoId);
    }
  }, [currentIndex, pluse, onIntervalTodo]);

  // On mount: restore from server
  useEffect(() => {
    getTimerSessions({ type: 'pluse' }).then((sessions) => {
      const active = sessions.find((s) => s.pluseId === pluse.id && s.status !== 'completed');
      if (!active) return;

      setSessionId(active.id);
      setCurrentIndex(active.currentIndex);
      setIsRunning(active.status === 'running');
      setIsCompleted(active.status === 'completed');

      if (active.status === 'running' && active.startedAt) {
        const runningElapsed = Math.floor((Date.now() - active.startedAt.getTime()) / 1000);
        const totalElapsed = active.elapsedSeconds + runningElapsed;
        // Catch up through completed intervals
        let idx = active.currentIndex;
        let e = totalElapsed;
        while (idx < totalItems) {
          const dur = expandedIntervals[idx];
          if (e < dur) break;
          e -= dur;
          idx++;
        }
        if (idx >= totalItems) {
          setCurrentIndex(totalItems - 1);
          setElapsedSeconds(expandedIntervals[totalItems - 1]);
          setIsRunning(false);
          setIsCompleted(true);
          setStartTime(null);
          updateTimerSession(active.id, { status: 'completed', completedAt: new Date() });
        } else {
          setCurrentIndex(idx);
          if (idx === active.currentIndex) {
            setElapsedSeconds(active.elapsedSeconds);
            setStartTime(active.startedAt.getTime());
          } else {
            setElapsedSeconds(0);
            setStartTime(Date.now() - e * 1000);
          }
        }
      } else {
        setElapsedSeconds(active.elapsedSeconds);
        setStartTime(null);
      }
    });
  }, [pluse.id, expandedIntervals, totalItems]);

  const getElapsed = useCallback(() => {
    if (!isRunning || !startTime) return elapsedSeconds;
    return elapsedSeconds + Math.floor((Date.now() - startTime) / 1000);
  }, [isRunning, elapsedSeconds, startTime]);

  const currentDuration = expandedIntervals[currentIndex] || 0;
  const itemDurationSeconds = currentDuration;
  const elapsed = getElapsed();
  const remainingSeconds = Math.max(0, itemDurationSeconds - elapsed);

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
    };
  }, []);

  // Check completion / auto-advance
  useEffect(() => {
    console.log('[timer] completion effect', { isCompleted, isRunning, elapsed, itemDurationSeconds, currentIndex, totalItems, autoAdvance: pluse.autoAdvance });
    if (isCompleted || !isRunning) return;
    const shouldAutoAdvance = pluse.autoAdvance !== false;
    if (elapsed >= itemDurationSeconds) {
      console.log('[timer] interval complete', { currentIndex, nextIndex: currentIndex + 1, shouldAutoAdvance });
      if (currentIndex < totalItems - 1) {
        const nextIndex = currentIndex + 1;
        setIsRunning(false);
        setCurrentIndex(nextIndex);
        setElapsedSeconds(0);
        setStartTime(null);
        if (sessionId) {
          updateTimerSession(sessionId, {
            currentIndex: nextIndex,
            elapsedSeconds: 0,
            status: 'paused',
          });
        }

        if (shouldAutoAdvance) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          console.log('[timer] scheduling auto-advance in 2s');
          timeoutRef.current = setTimeout(() => {
            console.log('[timer] auto-advance timeout fired');
            setIsRunning(true);
            setStartTime(Date.now());
            if (sessionId) {
              updateTimerSession(sessionId, {
                status: 'running',
                startedAt: new Date(),
              });
            }
          }, 2000);
        }
      } else {
        setIsRunning(false);
        setIsCompleted(true);
        setStartTime(null);
        if (sessionId) {
          updateTimerSession(sessionId, {
            status: 'completed',
            completedAt: new Date(),
          });
        }
      }
    }
  }, [elapsed, isRunning, isCompleted, currentIndex, totalItems, itemDurationSeconds, sessionId, pluse]);

  const toggleRunning = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isCompleted) {
      // Restart
      const newSession = await createTimerSession({
        type: 'pluse',
        name: pluse.name,
        pluseId: pluse.id,
        intervals: pluse.intervals,
        repeatCount: pluse.repeatCount,
        status: 'running',
        startedAt: new Date(),
      });
      setSessionId(newSession.id);
      setCurrentIndex(0);
      setElapsedSeconds(0);
      setIsRunning(true);
      setIsCompleted(false);
      setStartTime(Date.now());
      return;
    }

    if (isRunning) {
      // Pause
      const total = elapsedSeconds + (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
      setIsRunning(false);
      setElapsedSeconds(total);
      setStartTime(null);
      if (sessionId) {
        await updateTimerSession(sessionId, {
          status: 'paused',
          elapsedSeconds: total,
          pausedAt: new Date(),
        });
      }
    } else {
      // Resume / Start
      setIsRunning(true);
      setStartTime(Date.now());
      if (sessionId) {
        await updateTimerSession(sessionId, {
          status: 'running',
          startedAt: new Date(),
        });
      } else {
        const session = await createTimerSession({
          type: 'pluse',
          name: pluse.name,
          pluseId: pluse.id,
          intervals: pluse.intervals,
          repeatCount: pluse.repeatCount,
          status: 'running',
          startedAt: new Date(),
        });
        setSessionId(session.id);
      }
    }
  }, [isRunning, isCompleted, sessionId, elapsedSeconds, startTime, pluse]);

  const skipToNext = useCallback(async () => {
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
    if (sessionId) {
      await updateTimerSession(sessionId, {
        currentIndex: nextIndex,
        elapsedSeconds: 0,
        status: 'paused',
      });
    }
  }, [currentIndex, totalItems, sessionId]);

  const restart = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (sessionId) {
      await deleteTimerSession(sessionId);
    }
    const session = await createTimerSession({
      type: 'pluse',
      name: pluse.name,
      pluseId: pluse.id,
      intervals: pluse.intervals,
      repeatCount: pluse.repeatCount,
      status: 'paused',
      elapsedSeconds: 0,
      currentIndex: 0,
    });
    setSessionId(session.id);
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    setStartTime(null);
  }, [sessionId, pluse]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (isCompleted) {
    return (
      <div className="px-4 pt-5 pb-3 text-center">
        <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Done!
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {pluse.name} complete
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            onClick={restart}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Again
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const templateIndex = pluse.intervals.length > 0 ? currentIndex % pluse.intervals.length : 0;
  const boundTodoId = pluse.intervalTodos?.[templateIndex];
  const boundTodo = boundTodoId ? todos.find((t) => t.id === boundTodoId) : undefined;

  return (
    <div className="px-4 pt-5 pb-3 text-center">
      <div className="text-4xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        {formatCountdown(remainingSeconds)}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
        Interval {currentIndex + 1} of {totalItems} · {formatSeconds(currentDuration)}
      </div>
      {boundTodo && (
        <div className="mt-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 truncate px-2">
          {boundTodo.title}
        </div>
      )}
      <div className="flex items-center justify-center gap-2 mt-3">
        <button
          onClick={toggleRunning}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
            isRunning
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip
        </button>

        {elapsed > 0 && (
          <button
            onClick={restart}
            className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Restart"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={handleClose}
          className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

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
        className="flex items-center justify-center gap-1 w-full text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
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
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = priorityConfig[priority];
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} ${cfg.darkBg} ${cfg.darkText}`}
    >
      {cfg.label}
    </span>
  );
}

function CompactTodoRow({
  todo,
  selected,
  onSelect,
  onToggle,
  accent,
  dragHandle,
}: {
  todo: Todo;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, status: TodoStatus) => void;
  accent?: 'none' | 'urgent' | 'focus' | 'goal';
  dragHandle?: React.ReactNode;
}) {
  const isDone = todo.status === 'done';

  const accentClasses = {
    none: '',
    urgent: 'border-l-2 border-l-rose-400 dark:border-l-rose-500',
    focus: 'border-l-2 border-l-indigo-400 dark:border-l-indigo-500',
    goal: 'border-l-2 border-l-amber-400 dark:border-l-amber-500',
  };

  return (
    <div
      className={`flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-md transition-colors ${
        selected ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
      } ${accentClasses[accent || 'none']}`}
    >
      {dragHandle}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(todo.id, todo.status);
        }}
        className="mt-0.5 shrink-0"
      >
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(todo.id)}>
        <span
          className={`text-sm font-medium truncate block w-full ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {todo.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {todo.scheduledDate && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <Clock className="w-3 h-3" />
              {formatTime(todo.scheduledDate)}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatDuration(todo.estimatedMinutes)}
          </span>
          <PriorityBadge priority={todo.priority} />
          {todo.isGoal && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
              Goal
            </span>
          )}
        </div>
      </div>

      {todo.status === 'in_progress' && (
        <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          <Zap className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

/* ─── Sortable CompactTodoRow ─── */

type SectionType = 'in_progress' | 'overdue' | 'morning' | 'afternoon' | 'evening' | 'anytime' | 'done';

interface DisplayItem {
  id: string;
  todo: Todo;
  section: SectionType;
}

const sectionConfig: Record<SectionType, { label: string; icon: typeof Zap; color: string }> = {
  in_progress: { label: 'In Progress', icon: Zap, color: 'text-amber-600 dark:text-amber-400' },
  overdue: { label: 'Overdue', icon: AlertTriangle, color: 'text-rose-600 dark:text-rose-400' },
  morning: { label: 'Morning', icon: Sun, color: 'text-slate-500 dark:text-slate-400' },
  afternoon: { label: 'Afternoon', icon: Sunset, color: 'text-slate-500 dark:text-slate-400' },
  evening: { label: 'Evening', icon: Moon, color: 'text-slate-500 dark:text-slate-400' },
  anytime: { label: 'Anytime', icon: Target, color: 'text-slate-500 dark:text-slate-400' },
  done: { label: 'Done', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
};

function getAccent(todo: Todo, section: SectionType): 'none' | 'urgent' | 'focus' | 'goal' {
  if (todo.isGoal) return 'goal';
  if (section === 'in_progress') return 'focus';
  if (section === 'overdue') return 'urgent';
  return 'none';
}

function SortableCompactTodoRow({
  item,
  selectedTodoId,
  onSelect,
  onToggle,
}: {
  item: DisplayItem;
  selectedTodoId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, status: TodoStatus) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500"
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <CompactTodoRow
        todo={item.todo}
        selected={selectedTodoId === item.todo.id}
        onSelect={onSelect}
        onToggle={onToggle}
        accent={getAccent(item.todo, item.section)}
        dragHandle={dragHandle}
      />
    </div>
  );
}

function SectionHeader({ section }: { section: SectionType }) {
  const cfg = sectionConfig[section];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1 text-[10px] font-medium ${cfg.color} uppercase tracking-wider px-2 py-1`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </div>
  );
}

/* ─── Main Page ─── */

export function Today() {
  const navigate = useNavigate();
  const {
    todos,
    overdue,
    inProgress,
    suggested,
    isLoading: todosLoading,
    setStatus,
    schedule,
    refresh,
  } = useTodayData();

  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [panelTodoId, setPanelTodoId] = useState<string | null>(null);
  const [pluses, setPluses] = useState<Pluse[]>([]);
  const [plusesLoading, setPlusesLoading] = useState(true);
  const [activePluse, setActivePluse] = useState<Pluse | null>(null);

  useEffect(() => {
    getAllPluses().then((all) => {
      setPluses(all);
      if (all.length > 0) {
        setActivePluse(all[0]);
      }
      setPlusesLoading(false);
    });
  }, []);

  // Auto-select first in-progress todo
  useEffect(() => {
    if (inProgress.length > 0 && !selectedTodoId) {
      setSelectedTodoId(inProgress[0].id);
    }
  }, [inProgress, selectedTodoId]);

  async function toggleTodo(todoId: string, currentStatus: TodoStatus) {
    const newStatus: TodoStatus = currentStatus === 'done' ? 'pending' : 'done';
    await setStatus(todoId, newStatus);
  }

  async function handleSelectTodo(todoId: string) {
    setPanelTodoId(null);

    // Always fetch fresh in-progress todos from the DB — the React state
    // may be stale if a todo was started from the execution panel directly.
    const freshInProgress = await getInProgressTodos();
    const otherInProgress = freshInProgress.filter((t) => t.id !== todoId);

    // Pause other in-progress todos and log their time
    for (const todo of otherInProgress) {
      const startedAt = todo.startedAt ? new Date(todo.startedAt) : null;
      if (startedAt) {
        const elapsedMs = Date.now() - startedAt.getTime();
        const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
        await createTodoLog(todo.id, 'system', `Paused — worked ${elapsedMinutes} min`, {
          minutesSpent: elapsedMinutes,
          metadata: { action: 'auto_pause', from: 'in_progress', to: 'pending' },
        });
      }
      await setStatus(todo.id, 'pending');
    }

    // Start the selected todo if it's not already in_progress or done
    const targetTodo =
      todos.find((t) => t.id === todoId) ??
      overdue.find((t) => t.id === todoId) ??
      freshInProgress.find((t) => t.id === todoId);

    if (targetTodo && targetTodo.status !== 'in_progress' && targetTodo.status !== 'done') {
      await setStatus(todoId, 'in_progress');
    }

    // Refresh all state so the sidebar reflects the latest statuses
    await refresh();
    setSelectedTodoId(todoId);
  }

  async function handleNodeClick(todoId: string) {
    const chain = await traceSourceChain(todoId);
    const clickedIndex = chain.findIndex((t) => t.id === todoId);
    const closestGoal = clickedIndex > 0 ? chain[clickedIndex - 1] : chain[0];
    setPanelTodoId(todoId);
    setSelectedTodoId(closestGoal.id);
  }

  async function scheduleForToday(todoId: string) {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    await schedule(todoId, now);
  }

  function handleNavigate(path: string) {
    const todoMatch = path.match(/\/todo\/([^/]+)(?:\/execute)?/);
    if (todoMatch) {
      setPanelTodoId(null);
      setSelectedTodoId(todoMatch[1]);
    } else {
      navigate(path);
    }
  }

  // Build flat todo list: in-progress -> overdue -> scheduled -> anytime -> done
  const timeGroups = new Map<TimeOfDay | 'none', Todo[]>([
    ['morning', []],
    ['afternoon', []],
    ['evening', []],
    ['none', []],
  ]);

  const allActiveTodos: Todo[] = [];
  const doneTodos: Todo[] = [];

  for (const todo of inProgress) {
    allActiveTodos.push(todo);
  }
  for (const todo of overdue) {
    if (!allActiveTodos.find((t) => t.id === todo.id)) {
      allActiveTodos.push(todo);
    }
  }

  for (const todo of todos) {
    if (todo.status === 'done') {
      doneTodos.push(todo);
      continue;
    }
    if (allActiveTodos.find((t) => t.id === todo.id)) continue;
    if (!todo.scheduledDate) {
      timeGroups.get('none')!.push(todo);
    } else {
      timeGroups.get(getTimeOfDay(todo.scheduledDate))!.push(todo);
    }
  }

  for (const [, list] of timeGroups) {
    list.sort((a, b) => a.order - b.order);
  }

  for (const slot of ['morning', 'afternoon', 'evening', 'none'] as const) {
    for (const todo of timeGroups.get(slot)!) {
      allActiveTodos.push(todo);
    }
  }

  // Build flat display items for sortable list
  const displayItems: DisplayItem[] = [
    ...inProgress.map((t) => ({ id: t.id, todo: t, section: 'in_progress' as SectionType })),
    ...overdue.map((t) => ({ id: t.id, todo: t, section: 'overdue' as SectionType })),
    ...timeGroups.get('morning')!.map((t) => ({ id: t.id, todo: t, section: 'morning' as SectionType })),
    ...timeGroups.get('afternoon')!.map((t) => ({ id: t.id, todo: t, section: 'afternoon' as SectionType })),
    ...timeGroups.get('evening')!.map((t) => ({ id: t.id, todo: t, section: 'evening' as SectionType })),
    ...timeGroups.get('none')!.map((t) => ({ id: t.id, todo: t, section: 'anytime' as SectionType })),
    ...doneTodos.map((t) => ({ id: t.id, todo: t, section: 'done' as SectionType })),
  ];

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = displayItems.findIndex((i) => i.id === active.id);
    const newIndex = displayItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(displayItems, oldIndex, newIndex);
    const orderedIds = reordered.map((i) => i.id);

    await reorderTodos(orderedIds);
    await refresh();
  }

  const doneCount = doneTodos.length;
  const totalActive = todos.filter((t) => t.status !== 'done').length + overdue.length;

  const hasAnything =
    inProgress.length > 0 || overdue.length > 0 || totalActive > 0 || suggested.length > 0 || doneTodos.length > 0;

  const isLoading = todosLoading || plusesLoading;

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex gap-4 overflow-hidden">
      {/* ─── Left Sidebar ─── */}
      <div className="w-72 h-full flex flex-col gap-3 min-h-0 shrink-0">
        {/* Clock + Date Header */}
        <div className="shrink-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
          {/* Timer Clock or Active Pluse */}
          {activePluse ? (
            <PluseMiniTimer
              pluse={activePluse}
              onClose={() => setActivePluse(null)}
              onIntervalTodo={(todoId) => {
                if (todoId) setSelectedTodoId(todoId);
              }}
            />
          ) : (
            <TimerClock />
          )}

          {/* Status bar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  inProgress.length > 0
                    ? 'bg-amber-400 animate-pulse'
                    : totalActive > 0
                      ? 'bg-indigo-400'
                      : 'bg-emerald-400'
                }`}
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {inProgress.length > 0
                  ? `${inProgress.length} in progress`
                  : totalActive > 0
                    ? `${totalActive} left`
                    : 'All done'}
              </span>
            </div>
            {doneCount > 0 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {doneCount} done
              </span>
            )}
          </div>

          {/* Pluse selector */}
          {activePluse && pluses.length > 1 && (
            <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 relative">
              <PluseSelector
                pluses={pluses}
                activeId={activePluse.id}
                onSelect={(pluse) => setActivePluse(pluse)}
              />
            </div>
          )}
        </div>

        {/* Today's Todo List */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Today&apos;s Todos
              </h2>
            </div>
            {allActiveTodos.length > 0 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {allActiveTodos.length} left
              </span>
            )}
          </div>

          <div className="px-3 py-2 flex-1 overflow-y-auto min-h-0 relative">
            {!hasAnything ? (
              <div className="text-center py-8">
                <Target className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                  All caught up
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {displayItems.map((item, index) => {
                      const showHeader = index === 0 || displayItems[index - 1].section !== item.section;
                      return (
                        <div key={item.id}>
                          {showHeader && <SectionHeader section={item.section} />}
                          <SortableCompactTodoRow
                            item={item}
                            selectedTodoId={selectedTodoId}
                            onSelect={handleSelectTodo}
                            onToggle={toggleTodo}
                          />
                        </div>
                      );
                    })}

                    {/* Suggested (not sortable) */}
                    {suggested.length > 0 && (
                      <>
                        <div className="flex items-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider px-2 py-1">
                          <Flame className="w-3 h-3" />
                          Suggested
                        </div>
                        {suggested.slice(0, 3).map((todo) => (
                          <div
                            key={todo.id}
                            className="flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <div className="mt-0.5 shrink-0">
                              <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/todo/${todo.id}`}
                                className="text-sm text-left text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block w-full"
                              >
                                {todo.title}
                              </Link>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {formatDuration(todo.estimatedMinutes)}
                                </span>
                                <PriorityBadge priority={todo.priority} />
                              </div>
                            </div>
                            <button
                              onClick={() => scheduleForToday(todo.id)}
                              className="shrink-0 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Spacer for WebKit scroll padding bug */}
                    <div className="h-20" />
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      {/* ─── Right Main: Execution Detail ─── */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col min-h-0 overflow-hidden">
        {selectedTodoId ? (
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="mb-40">
              <TodoExecutionPanel
                todoId={panelTodoId ?? selectedTodoId}
                onNavigate={handleNavigate}
                showBreadcrumbs={true}
                todayTodos={allActiveTodos}
                onSwitchTodo={handleSelectTodo}
                onNodeClick={handleNodeClick}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto">
                <Target className="w-7 h-7 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-slate-100">
                Select a todo
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                Click any todo from the list on the left to view its execution details here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
