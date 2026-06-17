import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  ChevronRight,
  Zap,
  Flame,
  Target,
  CalendarCheck,
  Flag,
} from 'lucide-react';
import { useTodayData } from '../hooks/useTodos';
import { getInProgressTodos, getAllTodos } from '../db/todos';
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
  const expandedIntervals = useMemo(
    () => expandIntervals(pluse.intervals, pluse.repeatCount),
    [pluse.intervals, pluse.repeatCount]
  );
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
    if (isCompleted || !isRunning) return;
    const shouldAutoAdvance = pluse.autoAdvance !== false;
    if (elapsed >= itemDurationSeconds) {
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
          timeoutRef.current = setTimeout(() => {
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
  }, [elapsed, isRunning, isCompleted, currentIndex, totalItems, itemDurationSeconds, sessionId, pluse.autoAdvance]);

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

const goalStatusConfig: Record<
  string,
  { label: string; bg: string; text: string; darkBg: string; darkText: string }
> = {
  active: {
    label: 'Active',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    darkBg: 'dark:bg-emerald-950/30',
    darkText: 'dark:text-emerald-400',
  },
  paused: {
    label: 'Paused',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    darkBg: 'dark:bg-amber-950/30',
    darkText: 'dark:text-amber-400',
  },
  achieved: {
    label: 'Done',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    darkBg: 'dark:bg-blue-950/30',
    darkText: 'dark:text-blue-400',
  },
  abandoned: {
    label: 'Dropped',
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    darkBg: 'dark:bg-slate-800',
    darkText: 'dark:text-slate-400',
  },
};

function GoalStatusBadge({ status }: { status: string }) {
  const cfg = goalStatusConfig[status] ?? goalStatusConfig.active;
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} ${cfg.darkBg} ${cfg.darkText} shrink-0`}
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
  onTitleClick,
  accent,
  dragHandle,
}: {
  todo: Todo;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, status: TodoStatus) => void;
  onTitleClick?: (id: string) => void;
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
          onToggle(todo.id, todo.status ?? 'pending');
        }}
        className="mt-0.5 shrink-0"
      >
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => (onTitleClick ?? onSelect)(todo.id)}>
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
          {(todo.scheduledDate || todo.scheduledEndDate) && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <Clock className="w-3 h-3" />
              {todo.scheduledDate && formatTime(todo.scheduledDate)}
              {todo.scheduledDate && todo.scheduledEndDate && ' — '}
              {todo.scheduledEndDate && formatTime(todo.scheduledEndDate)}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatDuration(todo.estimatedMinutes ?? 60)}
          </span>
          <PriorityBadge priority={todo.priority ?? 'medium'} />
          {todo.nodeType === 'goal' && (
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

/* ─── Time Slot ─── */

interface TimeSlotConfig {
  id: string;
  milestoneId: string;
  title: string;
  time: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  icon: typeof Flag;
  color: string;
  bgColor: string;
  darkBgColor: string;
}

const TIME_SLOTS: TimeSlotConfig[] = [
  {
    id: 'slot-morning',
    milestoneId: 'system:day-startup',
    title: 'Day Startup Plan',
    time: '06:00',
    startHour: 6,
    startMinute: 0,
    endHour: 12,
    endMinute: 0,
    icon: Flag,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/30',
  },
  {
    id: 'slot-midday',
    milestoneId: 'system:morning-summary',
    title: 'Morning Summary',
    time: '12:00',
    startHour: 12,
    startMinute: 0,
    endHour: 13,
    endMinute: 0,
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50',
    darkBgColor: 'dark:bg-emerald-950/30',
  },
  {
    id: 'slot-afternoon',
    milestoneId: 'system:afternoon-startup',
    title: 'Afternoon Startup Plan',
    time: '13:00',
    startHour: 13,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
    icon: Flag,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/30',
  },
  {
    id: 'slot-late-afternoon',
    milestoneId: 'system:afternoon-summary',
    title: 'Afternoon Summary',
    time: '17:00',
    startHour: 17,
    startMinute: 0,
    endHour: 19,
    endMinute: 0,
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50',
    darkBgColor: 'dark:bg-emerald-950/30',
  },
  {
    id: 'slot-evening',
    milestoneId: 'system:evening-startup',
    title: 'Evening Startup',
    time: '19:00',
    startHour: 19,
    startMinute: 0,
    endHour: 21,
    endMinute: 30,
    icon: Flag,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50',
    darkBgColor: 'dark:bg-indigo-950/30',
  },
  {
    id: 'slot-night',
    milestoneId: 'system:evening-summary',
    title: 'Evening Summary',
    time: '21:30',
    startHour: 21,
    startMinute: 30,
    endHour: 24,
    endMinute: 0,
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50',
    darkBgColor: 'dark:bg-emerald-950/30',
  },
];

function getTimeSlotForTodo(todo: Todo): string | null {
  if (!todo.scheduledDate) return null;
  const date = new Date(todo.scheduledDate);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  for (const slot of TIME_SLOTS) {
    const startInMinutes = slot.startHour * 60 + slot.startMinute;
    const endInMinutes = slot.endHour * 60 + slot.endMinute;
    if (timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes) {
      return slot.id;
    }
  }
  return null;
}

function TimeSlotHeader({
  config,
  isCollapsed,
  onToggle,
  taskCount,
}: {
  config: TimeSlotConfig;
  isCollapsed: boolean;
  onToggle: () => void;
  taskCount: number;
}) {
  const Icon = config.icon;

  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50`}
    >
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${config.bgColor} ${config.darkBgColor} ${config.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {config.title}
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {config.time}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {taskCount > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {taskCount}
          </span>
        )}
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        )}
      </div>
    </button>
  );
}

function TimeSlotSection({
  config,
  todos,
  selectedTodoId,
  onSelect,
  onToggle,
  onTitleClick,
  isCollapsed,
  onToggleCollapse,
}: {
  config: TimeSlotConfig;
  todos: Todo[];
  selectedTodoId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, status: TodoStatus) => void;
  onTitleClick?: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <div className="mb-1">
      <TimeSlotHeader
        config={config}
        isCollapsed={isCollapsed}
        onToggle={onToggleCollapse}
        taskCount={todos.length}
      />
      {!isCollapsed && todos.length > 0 && (
        <div className="ml-4 pl-4 border-l border-slate-200 dark:border-slate-700 space-y-0.5">
          {todos.map((todo) => (
            <CompactTodoRow
              key={todo.id}
              todo={todo}
              selected={selectedTodoId === todo.id}
              onSelect={onSelect}
              onToggle={onToggle}
              onTitleClick={onTitleClick}
            />
          ))}
        </div>
      )}
      {!isCollapsed && todos.length === 0 && (
        <div className="ml-4 pl-4 border-l border-slate-200 dark:border-slate-700 py-2">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
            No tasks scheduled
          </span>
        </div>
      )}
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
    todayGoals,
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
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAllPluses().then((all) => {
      setPluses(all);
      if (all.length > 0) {
        const savedId = localStorage.getItem('todayActivePluseId');
        const saved = savedId ? all.find((p) => p.id === savedId) : null;
        setActivePluse(saved || all[0]);
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

  const toggleSlotCollapse = useCallback((slotId: string) => {
    setCollapsedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) {
        next.delete(slotId);
      } else {
        next.add(slotId);
      }
      return next;
    });
  }, []);

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

  // Build time slot groups (must not memoize – addActive mutates the map)
  const timeSlotGroups = new Map<string, Todo[]>();
  for (const slot of TIME_SLOTS) {
    timeSlotGroups.set(slot.id, []);
  }

  const allActiveTodos: Todo[] = [];
  const doneTodos: Todo[] = [];
  const seenDone = new Set<string>();
  const seenActive = new Set<string>();

  function addDone(todo: Todo) {
    if (seenDone.has(todo.id)) return;
    seenDone.add(todo.id);
    doneTodos.push(todo);
  }

  function addActive(todo: Todo) {
    if (todo.status === 'done') {
      addDone(todo);
      return;
    }
    if (seenActive.has(todo.id)) return;
    seenActive.add(todo.id);
    // Skip system tasks - they're shown as time slot headers
    if (todo.isSystemTask) return;
    
    const slotId = getTimeSlotForTodo(todo);
    if (slotId) {
      timeSlotGroups.get(slotId)!.push(todo);
    }
  }

  for (const todo of inProgress) addActive(todo);
  for (const todo of overdue) addActive(todo);
  for (const todo of todos) addActive(todo);

  // Sort tasks within each slot
  for (const [, list] of timeSlotGroups) {
    list.sort((a, b) => a.order - b.order);
  }

  // Preserve display order for active todos (used by the execution panel)
  const pushActiveOrdered = (todo: Todo) => {
    if (todo.status === 'done' || allActiveTodos.find((t) => t.id === todo.id)) return;
    allActiveTodos.push(todo);
  };
  for (const todo of inProgress) pushActiveOrdered(todo);
  for (const todo of overdue) pushActiveOrdered(todo);
  for (const slot of TIME_SLOTS) {
    for (const todo of timeSlotGroups.get(slot.id)!) pushActiveOrdered(todo);
  }

  const doneCount = doneTodos.length;
  const totalActive = allActiveTodos.length;

  // Check if any time slot has tasks

  const hasAnything =
    totalActive > 0 || suggested.length > 0 || doneTodos.length > 0;

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
              onClose={() => {
                setActivePluse(null);
                localStorage.removeItem('todayActivePluseId');
              }}
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
                onSelect={(pluse) => {
                  setActivePluse(pluse);
                  localStorage.setItem('todayActivePluseId', pluse.id);
                }}
              />
            </div>
          )}
        </div>

        {/* Today's Goals */}
        {todayGoals.length > 0 && (
          <div className="shrink-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <Flag className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Today&apos;s Goals
              </h2>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">
                {todayGoals.length}
              </span>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {todayGoals.map((goal) => (
                <button
                  key={goal.id}
                  onClick={() => navigate(`/todo/${goal.id}`)}
                  className="w-full flex items-center gap-2 text-left group"
                >
                  <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {goal.title}
                  </span>
                  <GoalStatusBadge status={goal.goalStatus ?? 'active'} />
                </button>
              ))}
            </div>
          </div>
        )}

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
              <div className="space-y-1">
                {/* Time Slots */}
                {TIME_SLOTS.map((slot) => (
                  <TimeSlotSection
                    key={slot.id}
                    config={slot}
                    todos={timeSlotGroups.get(slot.id) ?? []}
                    selectedTodoId={selectedTodoId}
                    onSelect={handleSelectTodo}
                    onToggle={toggleTodo}
                    onTitleClick={(id) => navigate(`/todo/${id}`)}
                    isCollapsed={collapsedSlots.has(slot.id)}
                    onToggleCollapse={() => toggleSlotCollapse(slot.id)}
                  />
                ))}

                {/* Suggested (not sortable) */}
                {suggested.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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
                              {formatDuration(todo.estimatedMinutes ?? 60)}
                            </span>
                            <PriorityBadge priority={todo.priority ?? 'medium'} />
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
                  </div>
                )}

                {/* Spacer for WebKit scroll padding bug */}
                <div className="h-20" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Right Main: Execution Detail ─── */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {selectedTodoId ? (
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="mb-40">
              <TodoExecutionPanel
                todoId={panelTodoId ?? selectedTodoId}
                onNavigate={handleNavigate}
                onTitleClick={(id) => navigate(`/todo/${id}`)}
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
