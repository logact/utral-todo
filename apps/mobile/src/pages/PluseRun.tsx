import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  ChevronLeft,
  Zap,
  CheckCircle2,
  Target,
} from 'lucide-react';
import type { Pluse, Todo, TimerSession } from '@utral/types';
import { getPluse } from '../db/pluse';
import { getTodo, updateTodoStatus } from '../db/todos';
import {
  getActiveTimerSession,
  createTimerSession,
  updateTimerSession,
  deleteTimerSession,
} from '../db/timerSessions';
import { nativeHaptic, nativeNotification, nativeTimer, nativeLiveActivity, isNativeShell } from '../bridge/native';

/* ---------- Browser Notification helpers ---------- */
let browserNotificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function showBrowserNotification(title: string, body: string): void {
  if (typeof window === 'undefined') return;
  if (isNativeShell()) {
    nativeTimer.schedule({
      id: `notif-${Date.now()}`,
      title,
      body,
      seconds: 1,
    }).catch(() => {});
    return;
  }
  if (!('Notification' in window)) return;
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

/* ---------- Unified timer notification ---------- */
function timerNotifySchedule(id: string, title: string, body: string, seconds: number): void {
  if (isNativeShell()) {
    nativeTimer.schedule({ id, title, body, seconds }).catch(() => {});
  } else {
    scheduleBrowserNotification(id, title, body, seconds);
  }
}

function timerNotifyCancel(id: string): void {
  if (isNativeShell()) {
    nativeNotification.cancel(id).catch(() => {});
  } else {
    cancelBrowserNotification(id);
  }
}

function timerNotifyCancelAll(): void {
  if (isNativeShell()) {
    nativeNotification.cancelAll().catch(() => {});
  }
  cancelAllBrowserNotifications();
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function expandIntervals(intervals: number[], repeatCount: number): number[] {
  const result: number[] = [];
  for (let r = 0; r < repeatCount; r++) {
    result.push(...intervals);
  }
  return result;
}

/* ---------- Timer sync with retry ---------- */
const MAX_SYNC_RETRIES = 3;

async function syncTimerStateWithRetry(
  sessionId: string,
  elapsedSeconds: number,
  currentIndex: number,
  status: string,
  startedAt?: Date
): Promise<void> {
  if (!isNativeShell()) return;

  for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
    try {
      await nativeTimer.syncTimerState({
        sessionId,
        elapsedSeconds,
        currentIndex,
        status,
        startedAt: startedAt?.getTime(),
      });
      return;
    } catch {
      if (attempt < MAX_SYNC_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 5000)));
      }
    }
  }
}

export function PluseRun() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const todoId = searchParams.get('todoId');
  const navSession = (location.state as { session?: TimerSession } | null)?.session;

  const [pluse, setPluse] = useState<Pluse | null>(null);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [todoMarkedDone, setTodoMarkedDone] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRef = useRef(false);
  const sessionRef = useRef<TimerSession | null>(null);
  const isRestoringRef = useRef(false);
  const elapsedSecondsRef = useRef(0);
  elapsedSecondsRef.current = elapsedSeconds;
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  // Load pluse and todo
  useEffect(() => {
    if (!id) return;
    if (!todoId) {
      navigate('/', { replace: true });
      return;
    }
    setIsLoading(true);
    Promise.all([getPluse(id), getTodo(todoId)]).then(([p, t]) => {
      setPluse(p || null);
      setTodo(t || null);
      setIsLoading(false);
    });
  }, [id, todoId, navigate]);

  const expandedIntervals = pluse ? expandIntervals(pluse.intervals, pluse.repeatCount) : [];
  const currentDuration = expandedIntervals[currentIndex] || 0;

  // Restore active timer session on mount
  useEffect(() => {
    if (!id || !todoId) return;

    async function restoreSession(session: TimerSession) {
      isRestoringRef.current = true;
      sessionRef.current = session;
      setCurrentIndex(session.currentIndex);

      if (session.status === 'running') {
        const awaySeconds = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
        const totalElapsed = session.elapsedSeconds + awaySeconds;
        setElapsedSeconds(totalElapsed);
        setIsRunning(true);
        await updateTimerSession(session.id, {
          elapsedSeconds: totalElapsed,
          startedAt: new Date(),
        });
      } else if (session.status === 'paused') {
        setElapsedSeconds(session.elapsedSeconds);
        setIsRunning(false);
      } else if (session.status === 'completed') {
        setIsCompleted(true);
        setIsRunning(false);
        setElapsedSeconds(session.elapsedSeconds);
      }

      if (session.status !== 'completed') {
        hasStartedRef.current = true;
        if (todoId) {
          updateTodoStatus(todoId, 'in_progress').catch(() => {});
        }
      }

      setTimeout(() => {
        isRestoringRef.current = false;
      }, 100);
    }

    // Prefer session passed via navigation state (instant restore)
    if (navSession && navSession.pluseId === id && navSession.todoId === todoId) {
      restoreSession(navSession);
      return;
    }

    // Fallback: query DB (waits for pluse to load for matching)
    if (!pluse) return;
    getActiveTimerSession().then((session) => {
      if (session && session.pluseId === id && session.todoId === todoId) {
        restoreSession(session);
      }
    });
  }, [id, todoId, pluse, navSession]);

  // Timer tick
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);

        // Update live activity countdown
        if (isNativeShell() && sessionRef.current && pluse) {
          const next = elapsedSecondsRef.current + 1;
          nativeLiveActivity.update({
            currentIndex: currentIndexRef.current,
            elapsedSeconds: next,
            isRunning: true,
            isCompleted: false,
            timerName: pluse.name,
          }).catch(() => {});
        }
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

  // Periodic sync while timer is running (every 30s)
  useEffect(() => {
    if (!isRunning || !sessionRef.current) return;

    const syncInterval = setInterval(() => {
      if (sessionRef.current && isRunning) {
        syncTimerStateWithRetry(
          sessionRef.current.id,
          elapsedSecondsRef.current,
          currentIndex,
          'running',
          sessionRef.current.startedAt
        ).catch(() => {});
      }
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [isRunning, currentIndex]);

  // Handle app returning from background - recalculate timer state
  useEffect(() => {
    if (!isNativeShell() || !sessionRef.current) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && sessionRef.current) {
        const result = await nativeTimer.getElapsedOnResume(sessionRef.current.id);
        if (!result.found) return;

        if (result.shouldComplete) {
          // Timer completed while in background
          setIsRunning(false);
          setIsCompleted(true);
          setElapsedSeconds(result.elapsed);
          setCurrentIndex(result.currentIndex);
          nativeHaptic.notification('success').catch(() => {});
          timerNotifyCancel(`pluse-timer-${pluse?.id}`);

          await updateTimerSession(sessionRef.current.id, {
            status: 'completed',
            completedAt: new Date(),
            elapsedSeconds: result.elapsed,
            currentIndex: result.currentIndex,
          });
          nativeTimer.stopBackground(sessionRef.current.id).catch(() => {});
          syncTimerStateWithRetry(
            sessionRef.current.id,
            result.elapsed,
            result.currentIndex,
            'completed',
            sessionRef.current.startedAt
          ).catch(() => {});
        } else if (result.completedIntervals && result.completedIntervals.length > 0) {
          // Some intervals completed while in background
          const lastCompleted = result.completedIntervals[result.completedIntervals.length - 1];
          const expanded = expandIntervals(pluse?.intervals || [], pluse?.repeatCount || 1);
          const nextIndex = lastCompleted + 1;

          if (nextIndex < expanded.length) {
            setCurrentIndex(result.currentIndex);
            setElapsedSeconds(result.elapsed);

            // Update session to next interval
            await updateTimerSession(sessionRef.current.id, {
              currentIndex: result.currentIndex,
              elapsedSeconds: result.elapsed,
              status: 'paused',
            });

            // Show notification about completed intervals
            showBrowserNotification(
              `${pluse?.name} — Intervals completed`,
              `Completed ${result.completedIntervals.length} interval(s) while away.`
            );
          } else {
            // All intervals completed
            setIsRunning(false);
            setIsCompleted(true);
            setElapsedSeconds(result.elapsed);
            setCurrentIndex(result.currentIndex);
            nativeHaptic.notification('success').catch(() => {});

            await updateTimerSession(sessionRef.current.id, {
              status: 'completed',
              completedAt: new Date(),
              elapsedSeconds: result.elapsed,
              currentIndex: result.currentIndex,
            });
            nativeTimer.stopBackground(sessionRef.current.id).catch(() => {});
            nativeLiveActivity.end(true).catch(() => {});
          }
        } else {
          // No intervals completed, just update elapsed
          setElapsedSeconds(result.elapsed);
          setCurrentIndex(result.currentIndex);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pluse]);

  // Auto-set todo to in_progress on first play (only for new sessions, not restored)
  useEffect(() => {
    if (isRunning && todoId && !hasStartedRef.current && !isRestoringRef.current) {
      hasStartedRef.current = true;
      updateTodoStatus(todoId, 'in_progress').catch(() => {});
    }
  }, [isRunning, todoId]);

  // Cancel all timer notifications on unmount
  useEffect(() => {
    return () => {
      timerNotifyCancelAll();
      if (sessionRef.current) {
        nativeTimer.stopBackground(sessionRef.current.id).catch(() => {});
        nativeLiveActivity.end(false).catch(() => {});
      }
    };
  }, []);

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

  // Check completion / auto-advance
  useEffect(() => {
    if (!pluse || isCompleted || isRestoringRef.current) return;
    const itemDurationSeconds = currentDuration;
    const shouldAutoAdvance = pluse.autoAdvance !== false;

    if (elapsedSeconds >= itemDurationSeconds && itemDurationSeconds > 0) {
      nativeHaptic.notification('success').catch(() => {});

      if (currentIndex < expandedIntervals.length - 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRunning(false);
        timerNotifyCancel(`pluse-timer-${pluse?.id}`);
        showBrowserNotification(
          `${pluse?.name} — Interval ${currentIndex + 1} complete`,
          `Interval ${currentIndex + 2} of ${expandedIntervals.length} is next.`
        );
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setElapsedSeconds(0);

        // Update session
        if (sessionRef.current) {
          updateTimerSession(sessionRef.current.id, {
            currentIndex: nextIndex,
            elapsedSeconds: 0,
            status: 'paused',
          }).catch(() => {});
        }

        if (shouldAutoAdvance) {
          setTimeout(() => {
            setIsRunning(true);
            if (sessionRef.current) {
              updateTimerSession(sessionRef.current.id, {
                status: 'running',
                startedAt: new Date(),
              }).catch(() => {});
            }
            nativeHaptic.impact('light').catch(() => {});
          }, 2000);
        }
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRunning(false);
        timerNotifyCancel(`pluse-timer-${pluse?.id}`);
        if (shouldAutoAdvance) {
          showBrowserNotification(
            `${pluse?.name} — Round complete`,
            'Restarting from interval 1...'
          );
          setCurrentIndex(0);
          setElapsedSeconds(0);
          setTimeout(() => {
            setIsRunning(true);
            if (sessionRef.current) {
              updateTimerSession(sessionRef.current.id, {
                currentIndex: 0,
                elapsedSeconds: 0,
                status: 'running',
                startedAt: new Date(),
              }).catch(() => {});
            }
            nativeHaptic.impact('light').catch(() => {});
          }, 2000);
        } else {
          setIsCompleted(true);
          nativeHaptic.notification('success').catch(() => {});
          timerNotifySchedule(
            `pluse-done-${pluse?.id}`,
            `${pluse?.name} — Complete!`,
            'All intervals finished. Great work!',
            1
          );
          if (sessionRef.current) {
            updateTimerSession(sessionRef.current.id, {
              status: 'completed',
              completedAt: new Date(),
            }).catch(() => {});
            nativeLiveActivity.end(true).catch(() => {});
            syncTimerStateWithRetry(
              sessionRef.current.id,
              elapsedSeconds,
              currentIndex,
              'completed',
              sessionRef.current.startedAt
            ).catch(() => {});
          }
        }
      }
    }
  }, [elapsedSeconds, pluse, currentIndex, isCompleted, currentDuration, expandedIntervals.length]);

  async function toggleRunning() {
    nativeHaptic.impact('light').catch(() => {});

    if (isRunning) {
      // Pausing
      setIsRunning(false);
      if (sessionRef.current) {
        await updateTimerSession(sessionRef.current.id, {
          elapsedSeconds: elapsedSecondsRef.current,
          status: 'paused',
          pausedAt: new Date(),
        });
        nativeTimer.stopBackground(sessionRef.current.id).catch(() => {});
        syncTimerStateWithRetry(
          sessionRef.current.id,
          elapsedSecondsRef.current,
          currentIndex,
          'paused',
          sessionRef.current.startedAt
        ).catch(() => {});
      }
    } else {
      // Starting or resuming
      requestBrowserNotificationPermission().catch(() => {});
      if (isNativeShell()) {
        nativeNotification.requestPermission().catch(() => {});
      }
      if (!sessionRef.current && pluse && todoId) {
        // Mark any existing active session as completed before creating new one
        const existing = await getActiveTimerSession();
        if (existing) {
          await updateTimerSession(existing.id, {
            status: 'completed',
            completedAt: new Date(),
          });
        }
        // Create new session on first start
        const session = await createTimerSession({
          type: 'pluse',
          name: pluse.name,
          pluseId: pluse.id,
          todoId,
          intervals: pluse.intervals,
          repeatCount: pluse.repeatCount,
          status: 'running',
          startedAt: new Date(),
          currentIndex: 0,
          elapsedSeconds: 0,
        });
        sessionRef.current = session;
      } else if (sessionRef.current) {
        await updateTimerSession(sessionRef.current.id, {
          status: 'running',
          startedAt: new Date(),
          pausedAt: undefined,
        });
      }

      // Start background timer on native side
      if (isNativeShell() && sessionRef.current && pluse) {
        const remaining = currentDuration - elapsedSeconds;
        const endTime = Date.now() + remaining * 1000;
        nativeTimer.startBackground({
          id: sessionRef.current.id,
          endTime,
          intervals: pluse.intervals,
          repeatCount: pluse.repeatCount,
          currentIndex,
          elapsedSeconds,
          pluseId: pluse.id,
          todoId: todoId || undefined,
        }).catch(() => {});

        // Start Live Activity
        nativeLiveActivity.start({
          sessionId: sessionRef.current.id,
          timerName: pluse.name,
          pluseId: pluse.id,
          todoId: todoId || undefined,
          intervals: pluse.intervals,
          repeatCount: pluse.repeatCount,
          currentIndex,
          elapsedSeconds,
        }).catch(() => {});

        // Sync timer state to server
        syncTimerStateWithRetry(
          sessionRef.current.id,
          elapsedSeconds,
          currentIndex,
          'running',
          sessionRef.current.startedAt
        ).catch(() => {});
      }

      setIsRunning(true);
    }
  }

  async function skipToNext() {
    if (currentIndex >= expandedIntervals.length - 1) return;
    const nextIndex = currentIndex + 1;
    setIsRunning(false);
    setCurrentIndex(nextIndex);
    setElapsedSeconds(0);
    nativeHaptic.impact('medium').catch(() => {});

    if (sessionRef.current) {
      await updateTimerSession(sessionRef.current.id, {
        currentIndex: nextIndex,
        elapsedSeconds: 0,
        status: 'paused',
      });
      nativeTimer.stopBackground(sessionRef.current.id).catch(() => {});
      syncTimerStateWithRetry(
        sessionRef.current.id,
        0,
        nextIndex,
        'paused',
        sessionRef.current.startedAt
      ).catch(() => {});
    }
  }

  async function restart() {
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    setTodoMarkedDone(false);
    hasStartedRef.current = false;
    nativeHaptic.impact('medium').catch(() => {});

    if (pluse) {
      timerNotifyCancel(`pluse-timer-${pluse.id}`);
      timerNotifyCancel(`pluse-done-${pluse.id}`);
    }

    if (sessionRef.current) {
      nativeTimer.stopBackground(sessionRef.current.id).catch(() => {});
      nativeLiveActivity.end(false).catch(() => {});
      await deleteTimerSession(sessionRef.current.id);
      sessionRef.current = null;
    }
  }

  async function markTodoDone() {
    if (!todoId) return;
    await updateTodoStatus(todoId, 'done');
    setIsRunning(false);
    setTodoMarkedDone(true);
    nativeHaptic.notification('success').catch(() => {});
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!pluse) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Pluse not found</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 font-medium"
        >
          Back to Today
        </button>
      </div>
    );
  }

  if (isCompleted) {
    const totalSeconds = expandedIntervals.reduce((s, d) => s + d, 0);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
          <Zap className="w-10 h-10 text-emerald-500" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Pluse Complete!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            You completed{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">{pluse.name}</span>
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {formatSeconds(totalSeconds)} total
          </p>
        </div>

        {todo && !todoMarkedDone && (
          <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Current task</p>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{todo.title}</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          {todo && !todoMarkedDone && (
            <button
              onClick={markTodoDone}
              className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl text-sm font-medium active:scale-95 transition-transform"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Task Done
            </button>
          )}

          {todoMarkedDone && (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Task completed!
            </div>
          )}

          <button
            onClick={restart}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          >
            <RotateCcw className="w-4 h-4" />
            Run Again
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-5 py-3 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          >
            Back to Today
          </button>
        </div>
      </div>
    );
  }

  const totalItems = expandedIntervals.length;
  const remainingSeconds = Math.max(0, currentDuration - elapsedSeconds);
  const progress = currentDuration > 0 ? elapsedSeconds / currentDuration : 0;

  return (
    <div className="flex flex-col min-h-[60vh] px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 active:text-slate-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {currentIndex + 1} / {totalItems}
        </span>
      </div>

      {/* Title */}
      <div className="text-center mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {pluse.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Interval {currentIndex + 1} of {totalItems} · {formatSeconds(currentDuration)}
        </p>
      </div>

      {/* Timer Ring */}
      <div className="flex justify-center mb-8">
        <TimerRing progress={progress}>
          <div className="text-center">
            <div className="text-5xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              {formatTime(remainingSeconds)}
            </div>
          </div>
        </TimerRing>
      </div>

      {/* Current Focus — Task */}
      {todo ? (
        <div className="mb-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Current Focus
              </span>
            </div>
            <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">
              {todo.title?.trim() || 'Untitled task'}
            </p>
            {todoMarkedDone && (
              <div className="flex items-center justify-center gap-1.5 mt-2 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Done
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No task linked to this session
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <button
          onClick={toggleRunning}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors active:scale-95 ${
            isRunning
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
              : 'bg-indigo-600 text-white active:bg-indigo-700'
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
          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          Skip
        </button>

        {elapsedSeconds > 0 && (
          <button
            onClick={restart}
            className="p-3 rounded-xl text-slate-400 dark:text-slate-500 active:text-slate-600 dark:active:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
            title="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mark Done */}
      {todo && !todoMarkedDone && (
        <div className="flex justify-center">
          <button
            onClick={markTodoDone}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 active:scale-95 transition-transform"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark Task Done
          </button>
        </div>
      )}
    </div>
  );
}

function TimerRing({
  progress,
  size = 240,
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
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-100 dark:text-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
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
