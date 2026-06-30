import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

function calcTotalMinutes(intervals: number[], repeatCount: number): number {
  const totalSeconds = intervals.reduce((s, d) => s + d, 0) * repeatCount;
  return Math.round(totalSeconds / 60);
}
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  CheckCircle2,
  ArrowLeft,
  ListTodo,
  ExternalLink,
  Check,
  Clock,
  Search,
  Unlink,
} from 'lucide-react';
import type { Pluse, Todo } from '../types';
import { getPluse } from '../db/pluse';
import { getAllTodos, updateTodoStatus } from '../db/todos';
import { createTimerSession, updateTimerSession, getTimerSessions } from '../db/timerSessions';
import { TodoExecutionPanel } from '../components/TodoExecutionPanel';
import { PulseEKG } from '../components/PulseEKG';
import { formatSeconds } from '../utils/date';

/* ---------- Helpers ---------- */
function expandIntervals(intervals: number[], repeatCount: number): number[] {
  const result: number[] = [];
  for (let r = 0; r < repeatCount; r++) {
    result.push(...intervals);
  }
  return result;
}

function calcTotalSeconds(intervals: number[], repeatCount: number): number {
  return intervals.reduce((s, d) => s + d, 0) * repeatCount;
}

/* ---------- Audio ---------- */
function useAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = useCallback((frequency = 880, duration = 200) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration / 1000);
    } catch {
      // Audio not available
    }
  }, []);

  const playFinish = useCallback(() => {
    playBeep(880, 200);
    setTimeout(() => playBeep(1100, 300), 250);
  }, [playBeep]);

  return { playBeep, playFinish };
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/* ---------- Components ---------- */
function TimerRing({
  progress,
  size = 280,
  strokeWidth = 8,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="text-slate-100 dark:text-slate-800"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-indigo-500 transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/* ---------- Todo Selector ---------- */
function TodoSelector({
  selectedTodoId,
  todos,
  onSelect,
  onClear,
}: {
  selectedTodoId?: string;
  todos: Todo[];
  onSelect: (todoId: string) => void;
  onClear: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selectedTodo = todos.find((t) => t.id === selectedTodoId);

  const filtered = todos.filter(
    (t) =>
      !search.trim() ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (selectedTodo) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <ListTodo className="w-3 h-3 text-indigo-500" />
        <span className="text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]">
          {selectedTodo.title}
        </span>
        <button
          onClick={onClear}
          className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"
          title="Unlink"
        >
          <Unlink className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
      >
        <ListTodo className="w-3.5 h-3.5" />
        Anchor a todo
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 rounded-md px-2 py-1">
              <Search className="w-3 h-3 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search todos..."
                autoFocus
                className="text-xs bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none w-full"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                No todos found
              </div>
            ) : (
              filtered.map((todo) => (
                <button
                  key={todo.id}
                  onClick={() => {
                    onSelect(todo.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors truncate"
                >
                  {todo.title}
                </button>
              ))
            )}
          </div>
          <div className="p-1.5 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={() => {
                onClear();
                setIsOpen(false);
              }}
              className="w-full text-left px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors"
            >
              Start without a todo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Browser Notification helpers ---------- */
const browserNotificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function isTauriApp(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (isTauriApp()) {
    const { requestPermission, isPermissionGranted } = await import('@tauri-apps/plugin-notification');
    const granted = await isPermissionGranted();
    if (granted) return true;
    const result = await requestPermission();
    return result === 'granted';
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function showBrowserNotification(title: string, body: string): Promise<void> {
  const log = (msg: string) => {
    try { (window as any).__TAURI_INTERNALS__.invoke('plugin:log|log', { level: 'info', message: `[PluseNotif] ${msg}` }).catch(() => {}); } catch {}
  };
  if (isTauriApp()) {
    log(`Tauri path: calling send_notification with title="${title}"`);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('send_notification', { title, body });
      log('invoke succeeded');
    } catch (err) {
      log(`invoke FAILED: ${err}`);
      console.error('[PluseRun] Failed to send notification:', err);
    }
    return;
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function scheduleBrowserNotification(id: string, title: string, body: string, seconds: number): void {
  cancelBrowserNotification(id);
  const ms = Math.max(1000, seconds * 1000);
  const timer = setTimeout(() => {
    showBrowserNotification(title, body);
    browserNotificationTimers.delete(id);
  }, ms);
  browserNotificationTimers.set(id, timer);
}

function cancelBrowserNotification(id: string): void {
  const timer = browserNotificationTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    browserNotificationTimers.delete(id);
  }
}

function cancelAllBrowserNotifications(): void {
  for (const timer of browserNotificationTimers.values()) {
    clearTimeout(timer);
  }
  browserNotificationTimers.clear();
}

/* ---------- Native bridge helpers ---------- */
function isNativeShell(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

async function nativeTimerSchedule(id: string, title: string, body: string, seconds: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('timer_schedule', { id, title, body, seconds });
}

async function nativeTimerCancel(id: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('timer_cancel', { id });
}

async function nativeTimerCancelAll(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('timer_cancel_all');
}

/* ---------- Unified timer notification ---------- */
function timerNotifySchedule(id: string, title: string, body: string, seconds: number): void {
  if (isNativeShell()) {
    nativeTimerSchedule(id, title, body, seconds).catch(() => {});
  } else {
    scheduleBrowserNotification(id, title, body, seconds);
  }
}

function timerNotifyCancel(id: string): void {
  if (isNativeShell()) {
    nativeTimerCancel(id).catch(() => {});
  } else {
    cancelBrowserNotification(id);
  }
}

function timerNotifyCancelAll(): void {
  if (isNativeShell()) {
    nativeTimerCancelAll().catch(() => {});
  }
  cancelAllBrowserNotifications();
}

/* ---------- Main Page ---------- */
export function PluseRun() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playBeep, playFinish } = useAudio();

  const [pluse, setPluse] = useState<Pluse | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [anchoredTodoId, setAnchoredTodoId] = useState<string | undefined>(undefined);
  const [todoMarkedDone, setTodoMarkedDone] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const intervalStartRef = useRef<number>(0);
  const [smoothElapsed, setSmoothElapsed] = useState(0);

  const loadPluse = useCallback(() => {
    if (!id) return;
    Promise.all([getPluse(id), getAllTodos()]).then(([p, allTodos]) => {
      setPluse(p || null);
      setTodos(allTodos);
      setIsLoading(false);
    });
  }, [id]);

  useEffect(() => {
    loadPluse();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { table: string; recordId: string } | undefined;
      if (detail?.table === 'pluse' && detail?.recordId === id) {
        clearTimeout(timeout);
        timeout = setTimeout(() => loadPluse(), 100);
      }
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [loadPluse, id]);

  // Sync remote timer session changes to local state
  useEffect(() => {
    if (!sessionId || !pluse?.id) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { table: string; recordId: string } | undefined;
      if (detail?.table !== 'timerSession') return;
      getTimerSessions({ type: 'pluse' }).then((sessions) => {
        const active = sessions.find((s) => s.pluseId === pluse.id && s.status !== 'completed');
        if (active && active.id !== sessionId) {
          setSessionId(active.id);
        }
        if (!active || active.status === 'completed') return;
        setCurrentIndex(active.currentIndex);
        if (active.status === 'running' && active.startedAt) {
          const awaySeconds = Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000);
          setElapsedSeconds(active.elapsedSeconds + awaySeconds);
          setIsRunning(true);
        } else if (active.status === 'paused') {
          setElapsedSeconds(active.elapsedSeconds);
          setIsRunning(false);
        }
        if (active.todoId !== undefined) {
          setAnchoredTodoId(active.todoId ?? undefined);
        }
      });
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => window.removeEventListener('sync:remote-applied', handler);
  }, [sessionId, pluse?.id]);

  const expandedIntervals = useMemo(
    () => (pluse ? expandIntervals(pluse.intervals, pluse.repeatCount) : []),
    [pluse]
  );
  const currentDuration = expandedIntervals[currentIndex] || 0;
  const anchoredTodo = anchoredTodoId ? todos.find((t) => t.id === anchoredTodoId) : undefined;

  // Restore existing timer session on mount
  useEffect(() => {
    if (!pluse) return;
    getTimerSessions({ type: 'pluse' }).then((sessions) => {
      const active = sessions.find((s) => s.pluseId === pluse.id && s.status !== 'completed');
      if (!active) return;

      setSessionId(active.id);
      setCurrentIndex(active.currentIndex);

      if (active.status === 'running' && active.startedAt) {
        const runningElapsed = Math.floor((Date.now() - active.startedAt.getTime()) / 1000);
        const totalElapsed = active.elapsedSeconds + runningElapsed;
        let idx = active.currentIndex;
        let e = totalElapsed;
        while (idx < expandedIntervals.length) {
          const dur = expandedIntervals[idx];
          if (e < dur) break;
          e -= dur;
          idx++;
        }
        if (idx >= expandedIntervals.length) {
          setCurrentIndex(expandedIntervals.length - 1);
          setElapsedSeconds(expandedIntervals[expandedIntervals.length - 1]);
          setIsRunning(false);
          setIsCompleted(true);
          updateTimerSession(active.id, { status: 'completed', completedAt: new Date() });
        } else {
          setCurrentIndex(idx);
          setElapsedSeconds(idx === active.currentIndex ? active.elapsedSeconds : 0);
          setIsRunning(true);
        }
      } else if (active.status === 'paused') {
        setElapsedSeconds(active.elapsedSeconds);
        setIsRunning(false);
      }
      if (active.todoId) {
        setAnchoredTodoId(active.todoId);
      }
    });
  }, [pluse, expandedIntervals]);

  // Cancel all timer notifications on unmount
  useEffect(() => {
    return () => {
      timerNotifyCancelAll();
      if (autoAdvanceRef.current) {
        clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
    };
  }, []);

  // Timer
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Smooth animation frame for real-time EKG movement
  useEffect(() => {
    if (isRunning) {
      intervalStartRef.current = Date.now() - elapsedSeconds * 1000;

      function tick() {
        const now = Date.now();
        setSmoothElapsed((now - intervalStartRef.current) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      }

      rafRef.current = requestAnimationFrame(tick);
    } else {
      setSmoothElapsed(elapsedSeconds);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning, elapsedSeconds]);

  // Auto-switch anchored todo when interval changes
  useEffect(() => {
    if (!pluse || pluse.intervals.length === 0) return;
    const templateIndex = currentIndex % pluse.intervals.length;
    const boundTodoId = pluse.intervalTodos?.[templateIndex];
    if (boundTodoId) {
      setAnchoredTodoId(boundTodoId);
    }
  }, [currentIndex, pluse]);

  // Persist anchoredTodoId to session when it changes
  useEffect(() => {
    if (!sessionId) return;
    updateTimerSession(sessionId, { todoId: anchoredTodoId ?? null }).catch(() => {});
  }, [anchoredTodoId, sessionId]);

  // Schedule/cancel timer notifications
  useEffect(() => {
    if (!pluse) return;

    const timerNotificationId = `pluse-timer-${pluse.id}`;

    if (isRunning && !isCompleted && currentDuration > elapsedSeconds) {
      const remaining = currentDuration - elapsedSeconds;
      timerNotifySchedule(
        timerNotificationId,
        `${pluse.name} — Interval ${currentIndex + 1} complete`,
        'Your timer interval has finished.',
        remaining
      );
    } else {
      timerNotifyCancel(timerNotificationId);
    }

    return () => {
      timerNotifyCancel(timerNotificationId);
    };
  }, [isRunning, pluse, currentIndex, elapsedSeconds, isCompleted, currentDuration]);

  // Check for item completion
  useEffect(() => {
    if (!pluse || isCompleted) return;
    const itemDurationSeconds = currentDuration;
    const shouldAutoAdvance = pluse.autoAdvance !== false;

    if (elapsedSeconds >= itemDurationSeconds) {
      if (soundEnabled && !completedRef.current) {
        playBeep();
        completedRef.current = true;
      }

      if (currentIndex < expandedIntervals.length - 1) {
        const nextIdx = currentIndex + 1;
        if (timerRef.current) clearInterval(timerRef.current);
        if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
        setIsRunning(false);
        timerNotifyCancel(`pluse-timer-${pluse?.id}`);
        showBrowserNotification(
          `${pluse?.name} — Interval ${currentIndex + 1} complete`,
          `Interval ${nextIdx + 1} of ${expandedIntervals.length} is next.`
        );
        setCurrentIndex(nextIdx);
        setElapsedSeconds(0);
        if (sessionId) {
          updateTimerSession(sessionId, {
            currentIndex: nextIdx,
            elapsedSeconds: 0,
            status: 'paused',
            pausedAt: new Date(),
          });
        }
        if (shouldAutoAdvance) {
          console.log('[PluseRun] scheduling auto-advance in 2s');
          autoAdvanceRef.current = setTimeout(() => {
            console.log('[PluseRun] auto-advance timeout fired');
            autoAdvanceRef.current = null;
            setIsRunning(true);
            if (sessionId) {
              updateTimerSession(sessionId, {
                status: 'running',
                startedAt: new Date(),
                pausedAt: null,
              });
            }
            if (soundEnabled) playBeep(660, 150);
          }, 2000);
        }
      } else {
        // Last interval finished
        console.log('[PluseRun] last interval complete', { shouldAutoAdvance });
        if (timerRef.current) clearInterval(timerRef.current);
        if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
        setIsRunning(false);
        timerNotifyCancel(`pluse-timer-${pluse?.id}`);
        if (shouldAutoAdvance) {
          // Auto-restart the whole pulse after a brief pause
          console.log('[PluseRun] auto-restarting pulse in 2s');
          setCurrentIndex(0);
          setElapsedSeconds(0);
          setSmoothElapsed(0);
          completedRef.current = false;
          if (sessionId) {
            updateTimerSession(sessionId, {
              currentIndex: 0,
              elapsedSeconds: 0,
              status: 'paused',
              pausedAt: new Date(),
            });
          }
          showBrowserNotification(
            `${pluse?.name} — Round complete`,
            'Restarting from interval 1...'
          );
          autoAdvanceRef.current = setTimeout(() => {
            console.log('[PluseRun] auto-restart timeout fired');
            autoAdvanceRef.current = null;
            setIsRunning(true);
            if (sessionId) {
              updateTimerSession(sessionId, {
                status: 'running',
                startedAt: new Date(),
                pausedAt: null,
              });
            }
            if (soundEnabled) playBeep(660, 150);
          }, 2000);
        } else {
          // Stop — user must manually restart
          setIsCompleted(true);
          if (sessionId) {
            updateTimerSession(sessionId, {
              status: 'completed',
              completedAt: new Date(),
            });
          }
          timerNotifySchedule(
            `pluse-done-${pluse?.id}`,
            `${pluse?.name} — Complete!`,
            'All intervals finished. Great work!',
            1
          );
        }
      }
    }
  }, [elapsedSeconds, pluse, currentIndex, isCompleted, currentDuration, expandedIntervals.length, soundEnabled, playBeep, playFinish, sessionId]);

  async function toggleRunning() {
    if (isRunning) {
      // Pause
      setIsRunning(false);
      if (sessionId) {
        await updateTimerSession(sessionId, {
          status: 'paused',
          elapsedSeconds,
          currentIndex,
          pausedAt: new Date(),
        });
      }
    } else {
      // Start or Resume
      requestBrowserNotificationPermission().catch(() => {});
      setIsRunning(true);
      if (sessionId) {
        await updateTimerSession(sessionId, {
          status: 'running',
          startedAt: new Date(),
          pausedAt: null,
        });
      } else if (pluse) {
        const session = await createTimerSession({
          type: 'pluse',
          name: pluse.name,
          pluseId: pluse.id,
          todoId: anchoredTodoId,
          intervals: pluse.intervals,
          repeatCount: pluse.repeatCount,
          currentIndex,
          elapsedSeconds,
          status: 'running',
          startedAt: new Date(),
        });
        setSessionId(session.id);
      }
    }
  }

  async function skipToNext() {
    if (currentIndex < expandedIntervals.length - 1) {
      const nextIndex = currentIndex + 1;
      setIsRunning(false);
      setCurrentIndex(nextIndex);
      setElapsedSeconds(0);
      if (sessionId) {
        await updateTimerSession(sessionId, {
          currentIndex: nextIndex,
          elapsedSeconds: 0,
          status: 'paused',
          pausedAt: new Date(),
        });
      }
    }
  }

  async function restart() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setSmoothElapsed(0);
    setIsRunning(false);
    setIsCompleted(false);
    setTodoMarkedDone(false);
    completedRef.current = false;
    if (pluse) {
      timerNotifyCancel(`pluse-timer-${pluse.id}`);
      timerNotifyCancel(`pluse-done-${pluse.id}`);
    }
    if (sessionId) {
      await updateTimerSession(sessionId, {
        currentIndex: 0,
        elapsedSeconds: 0,
        status: 'paused',
        pausedAt: new Date(),
      });
    }
  }

  async function endSession() {
    if (!showConfirmEnd) {
      setShowConfirmEnd(true);
      return;
    }
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setIsRunning(false);
    if (pluse) {
      timerNotifyCancel(`pluse-timer-${pluse.id}`);
      timerNotifyCancel(`pluse-done-${pluse.id}`);
    }
    if (sessionId) {
      await updateTimerSession(sessionId, {
        status: 'completed',
        completedAt: new Date(),
      });
    }
    navigate('/pluses');
  }

  async function markTodoDone(todoId: string) {
    await updateTodoStatus(todoId, 'done');
    setTodoMarkedDone(true);
  }

  if (isLoading) {
    return <div className="text-slate-500 dark:text-slate-400">Loading...</div>;
  }

  if (!pluse) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Pluse not found</p>
        <button
          onClick={() => navigate('/pluses')}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pluses
        </button>
      </div>
    );
  }

  if (isCompleted) {
    const totalSeconds = calcTotalSeconds(pluse.intervals, pluse.repeatCount);

    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Pluse Complete!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            You completed <span className="font-medium text-slate-700 dark:text-slate-300">{pluse.name}</span> in {formatSeconds(totalSeconds)}.
          </p>
        </div>

        {anchoredTodo && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-left space-y-3">
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Anchored Todo
            </h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ListTodo className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className={`text-sm truncate ${todoMarkedDone || anchoredTodo.status === 'done' ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                  {anchoredTodo.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {anchoredTodo.status !== 'done' && !todoMarkedDone && (
                  <button
                    onClick={() => markTodoDone(anchoredTodo.id)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Mark done
                  </button>
                )}
                <button
                  onClick={() => navigate(`/todo/${anchoredTodo.id}`)}
                  className="p-1 text-slate-400 dark:text-slate-500 hover:text-indigo-500 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={restart}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Run Again
          </button>
          <button
            onClick={() => navigate('/pluses')}
            className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>
    );
  }

  const totalItems = expandedIntervals.length;
  const itemDurationSeconds = currentDuration;
  const remainingSeconds = Math.max(0, itemDurationSeconds - elapsedSeconds);
  const progress = itemDurationSeconds > 0 ? elapsedSeconds / itemDurationSeconds : 0;

  return (
    <div className={anchoredTodo?.id ? "max-w-6xl mx-auto space-y-6" : "max-w-lg mx-auto space-y-6"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/pluses')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={endSession}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors px-2 py-1"
          >
            {showConfirmEnd ? 'Confirm End' : 'End'}
          </button>
          {showConfirmEnd && (
            <button
              onClick={() => setShowConfirmEnd(false)}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 px-2 py-1"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {pluse.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Interval {currentIndex + 1} of {totalItems}
        </p>
      </div>

      {/* Todo anchor selector */}
      {!isRunning && elapsedSeconds === 0 && (
        <div className="flex items-center justify-center">
          <TodoSelector
            selectedTodoId={anchoredTodoId}
            todos={todos}
            onSelect={setAnchoredTodoId}
            onClear={() => setAnchoredTodoId(undefined)}
          />
        </div>
      )}

      {/* Main content: timer left, todo panel right */}
      {anchoredTodo?.id ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: Timer + Controls + Sequence */}
          <div className="space-y-6">
            {/* Timer */}
            <div className="flex justify-center">
              <TimerRing progress={progress}>
                <div className="text-center">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium mb-2 text-indigo-600 dark:text-indigo-400">
                    <Clock className="w-3.5 h-3.5" />
                    Interval {currentIndex + 1}
                  </div>
                  <div className="text-5xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                    {formatTime(remainingSeconds)}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {formatSeconds(currentDuration)}
                  </div>
                </div>
              </TimerRing>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={toggleRunning}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isRunning
                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {elapsedSeconds > 0 ? 'Resume' : 'Start'}
                  </>
                )}
              </button>

              <button
                onClick={skipToNext}
                disabled={currentIndex >= totalItems - 1}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <SkipForward className="w-4 h-4" />
                Skip
              </button>

              {elapsedSeconds > 0 && (
                <button
                  onClick={restart}
                  className="p-3 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Restart"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* EKG Visualization */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <button
                onClick={() => setShowDiagram((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                Sequence
                {showDiagram ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {showDiagram && (
                <div className="mt-3">
                  <PulseEKG
                    intervals={expandedIntervals}
                    currentIndex={currentIndex}
                    elapsedSeconds={smoothElapsed}
                    isRunning={isRunning}
                  />

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${totalItems > 0 ? ((currentIndex + progress) / totalItems) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {totalItems > 0 ? Math.round(((currentIndex + progress) / totalItems) * 100) : 0}% done
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {formatSeconds(expandedIntervals.reduce((s, d, idx) => s + (idx < currentIndex ? d : 0), 0))} /{' '}
                        {formatSeconds(calcTotalSeconds(pluse.intervals, pluse.repeatCount))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Todo Execution Panel */}
          <div className="max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
            <TodoExecutionPanel
              todoId={anchoredTodo.id}
              onNavigate={(path) => navigate(path)}
              onTitleClick={(todoId) => navigate(`/todo/${todoId}`)}
              showBreadcrumbs={false}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Timer */}
          <div className="flex justify-center">
            <TimerRing progress={progress}>
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium mb-2 text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-3.5 h-3.5" />
                  Interval {currentIndex + 1}
                </div>
                <div className="text-5xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                  {formatTime(remainingSeconds)}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {currentDuration} minutes
                </div>
              </div>
            </TimerRing>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={toggleRunning}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors ${
                isRunning
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {elapsedSeconds > 0 ? 'Resume' : 'Start'}
                </>
              )}
            </button>

            <button
              onClick={skipToNext}
              disabled={currentIndex >= totalItems - 1}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </button>

            {elapsedSeconds > 0 && (
              <button
                onClick={restart}
                className="p-3 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Restart"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* EKG Visualization */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <button
              onClick={() => setShowDiagram((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Sequence
              {showDiagram ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showDiagram && (
              <div className="mt-3">
                <PulseEKG
                  intervals={expandedIntervals}
                  currentIndex={currentIndex}
                  elapsedSeconds={smoothElapsed}
                  isRunning={isRunning}
                />

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${totalItems > 0 ? ((currentIndex + progress) / totalItems) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {totalItems > 0 ? Math.round(((currentIndex + progress) / totalItems) * 100) : 0}% done
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {expandedIntervals.reduce((s, d, idx) => s + (idx < currentIndex ? d : 0), 0)} /{' '}
                      {calcTotalMinutes(pluse.intervals, pluse.repeatCount)} min
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
