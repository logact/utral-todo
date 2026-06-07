import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, SkipForward, RotateCcw, ChevronLeft, Zap } from 'lucide-react';
import type { Pluse } from '@utral/types';
import { getPluse } from '../db/pluse';
import { nativeHaptic } from '../bridge/native';

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

export function PluseRun() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pluse, setPluse] = useState<Pluse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    getPluse(id).then((p) => {
      setPluse(p || null);
      setIsLoading(false);
    });
  }, [id]);

  const expandedIntervals = pluse ? expandIntervals(pluse.intervals, pluse.repeatCount) : [];
  const currentDuration = expandedIntervals[currentIndex] || 0;

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

  useEffect(() => {
    if (!pluse || isCompleted) return;
    const itemDurationSeconds = currentDuration;
    const shouldAutoAdvance = pluse.autoAdvance !== false;

    if (elapsedSeconds >= itemDurationSeconds && itemDurationSeconds > 0) {
      nativeHaptic.notification('success').catch(() => {});

      if (currentIndex < expandedIntervals.length - 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRunning(false);
        setCurrentIndex((prev) => prev + 1);
        setElapsedSeconds(0);
        if (shouldAutoAdvance) {
          setTimeout(() => {
            setIsRunning(true);
            nativeHaptic.impact('light').catch(() => {});
          }, 2000);
        }
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRunning(false);
        if (shouldAutoAdvance) {
          setCurrentIndex(0);
          setElapsedSeconds(0);
          setTimeout(() => {
            setIsRunning(true);
            nativeHaptic.impact('light').catch(() => {});
          }, 2000);
        } else {
          setIsCompleted(true);
          nativeHaptic.notification('success').catch(() => {});
        }
      }
    }
  }, [elapsedSeconds, pluse, currentIndex, isCompleted, currentDuration, expandedIntervals.length]);

  function toggleRunning() {
    setIsRunning((r) => !r);
    nativeHaptic.impact('light').catch(() => {});
  }

  function skipToNext() {
    if (currentIndex < expandedIntervals.length - 1) {
      setIsRunning(false);
      setCurrentIndex((prev) => prev + 1);
      setElapsedSeconds(0);
      nativeHaptic.impact('medium').catch(() => {});
    }
  }

  function restart() {
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    nativeHaptic.impact('medium').catch(() => {});
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
      <div className="px-4 py-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto">
          <Zap className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Pluse Complete!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            You completed <span className="font-medium text-slate-700 dark:text-slate-300">{pluse.name}</span>
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {formatSeconds(totalSeconds)} total
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={restart}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          >
            <RotateCcw className="w-4 h-4" />
            Run Again
          </button>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const totalItems = expandedIntervals.length;
  const remainingSeconds = Math.max(0, currentDuration - elapsedSeconds);
  const progress = currentDuration > 0 ? elapsedSeconds / currentDuration : 0;

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
      <div className="text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {pluse.name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Interval {currentIndex + 1} of {totalItems}
        </p>
      </div>

      {/* Timer Ring */}
      <div className="flex justify-center">
        <TimerRing progress={progress}>
          <div className="text-center">
            <div className="text-5xl font-mono font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              {formatTime(remainingSeconds)}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {formatSeconds(currentDuration)} total
            </div>
          </div>
        </TimerRing>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
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

      {/* Interval dots */}
      <div className="flex items-center justify-center gap-1.5">
        {expandedIntervals.map((_, idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx < currentIndex
                ? 'w-1.5 bg-emerald-400'
                : idx === currentIndex
                  ? 'w-4 bg-indigo-500'
                  : 'w-1.5 bg-slate-200 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>
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
