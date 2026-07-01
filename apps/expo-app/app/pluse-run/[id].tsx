import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { getPluse } from '@/lib/pluse';
import {
  startPluseTimer,
  pausePluseTimer,
  resumePluseTimer,
  stopPluseTimer,
  advancePluseTimer,
  getElapsedSeconds,
  getActivePluseTimer,
} from '@/lib/database';
import {
  hapticImpact,
  hapticNotification,
  scheduleNotification,
  cancelAllNotifications,
  requestNotificationPermission,
} from '@/lib/native';
import type { Pluse } from '@/lib/database';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#6366f1"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

export default function PluseRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pluse, setPluse] = useState<Pluse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  const [, forceTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expandedIntervals = useMemo(
    () => (pluse ? expandIntervals(pluse.intervals, pluse.repeatCount) : []),
    [pluse]
  );
  const totalItems = expandedIntervals.length;

  // Reconstruct local state from the persisted pluse row (authoritative).
  const syncFromDb = useCallback(async () => {
    if (!id) return;
    const p = await getPluse(id);
    setPluse(p);
    if (!p) {
      setIsLoading(false);
      return;
    }
    const intervals = expandIntervals(p.intervals, p.repeatCount);
    const total = intervals.length;

    const active = await getActivePluseTimer();
    if (!active || active.id !== id) {
      setIsRunning(false);
      setIsCompleted(false);
      setCurrentIndex(p.currentIntervalIndex ?? 0);
      setElapsedSeconds(p.accumulatedSeconds ?? 0);
      setStartTime(null);
      setIsLoading(false);
      return;
    }

    setCurrentIndex(active.currentIntervalIndex);
    setIsRunning(active.timerStatus === 'running');

    if (active.timerStatus === 'running' && active.startedAt) {
      const totalElapsed = getElapsedSeconds(active);
      let idx = active.currentIntervalIndex;
      let e = totalElapsed;
      while (idx < total) {
        const dur = intervals[idx];
        if (e < dur) break;
        e -= dur;
        idx++;
      }
      if (idx >= total) {
        setCurrentIndex(total - 1);
        setElapsedSeconds(intervals[total - 1] ?? 0);
        setIsRunning(false);
        setIsCompleted(true);
        setStartTime(null);
        await stopPluseTimer(id);
      } else {
        setCurrentIndex(idx);
        if (idx === active.currentIntervalIndex) {
          setElapsedSeconds(active.accumulatedSeconds);
          setStartTime(new Date(active.startedAt).getTime());
        } else {
          setElapsedSeconds(0);
          setStartTime(Date.now() - e * 1000);
        }
      }
    } else {
      setElapsedSeconds(active.accumulatedSeconds);
      setStartTime(null);
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    syncFromDb();
  }, [syncFromDb]);

  // Re-sync when the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      syncFromDb();
    }, [syncFromDb])
  );

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    return () => {
      cancelAllNotifications();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const getElapsed = useCallback(() => {
    if (!isRunning || !startTime) return elapsedSeconds;
    return elapsedSeconds + Math.floor((Date.now() - startTime) / 1000);
  }, [isRunning, elapsedSeconds, startTime]);

  const currentDuration = expandedIntervals[currentIndex] || 0;
  const elapsed = getElapsed();
  const remainingSeconds = Math.max(0, currentDuration - elapsed);
  const progress = currentDuration > 0 ? Math.min(1, elapsed / currentDuration) : 0;

  // Tick every second while running (recomputes elapsed from wall clock).
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

  useEffect(() => {
    if (isRunning && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isRunning]);

  // Check completion / auto-advance.
  useEffect(() => {
    if (isCompleted || !isRunning || !pluse) return;
    const shouldAutoAdvance = pluse.autoAdvance !== false;
    if (elapsed >= currentDuration) {
      hapticNotification('success');
      if (currentIndex < totalItems - 1) {
        const nextIndex = currentIndex + 1;
        setIsRunning(false);
        setCurrentIndex(nextIndex);
        setElapsedSeconds(0);
        setStartTime(null);
        pausePluseTimer(pluse.id, 0, nextIndex).catch(() => {});

        scheduleNotification(
          `${pluse.name} — Interval ${currentIndex + 1} complete`,
          `Interval ${nextIndex + 1} of ${totalItems} is next.`,
          1
        );

        if (shouldAutoAdvance) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            setIsRunning(true);
            setStartTime(Date.now());
            resumePluseTimer(pluse.id).catch(() => {});
            hapticImpact();
          }, 2000);
        }
      } else {
        setIsRunning(false);
        setIsCompleted(true);
        setStartTime(null);
        stopPluseTimer(pluse.id).catch(() => {});
        scheduleNotification(`${pluse.name} — Complete!`, 'All intervals finished. Great work!', 1);
      }
    }
  }, [elapsed, isRunning, isCompleted, currentIndex, totalItems, currentDuration, pluse]);

  const toggleRunning = useCallback(async () => {
    if (!pluse) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    hapticImpact();

    if (isCompleted) {
      setIsCompleted(false);
      setCurrentIndex(0);
      setElapsedSeconds(0);
      setIsRunning(true);
      setStartTime(Date.now());
      await startPluseTimer(pluse.id);
      return;
    }

    if (isRunning) {
      const total = elapsedSeconds + (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
      setIsRunning(false);
      setElapsedSeconds(total);
      setStartTime(null);
      await pausePluseTimer(pluse.id, total, currentIndex);
    } else {
      setIsRunning(true);
      setStartTime(Date.now());
      if (pluse.timerStatus === 'idle' && elapsedSeconds === 0 && currentIndex === 0) {
        await startPluseTimer(pluse.id);
      } else {
        await resumePluseTimer(pluse.id);
      }
    }
  }, [isRunning, isCompleted, elapsedSeconds, startTime, currentIndex, pluse]);

  const skipToNext = useCallback(async () => {
    if (!pluse) return;
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
    hapticImpact();
    await advancePluseTimer(pluse.id, nextIndex);
  }, [currentIndex, totalItems, pluse]);

  const restart = useCallback(async () => {
    if (!pluse) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    cancelAllNotifications();
    await stopPluseTimer(pluse.id);
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    setStartTime(null);
    hapticImpact();
  }, [pluse]);

  const handleBack = useCallback(() => {
    // The pluse DB row is authoritative; just stop the local ticker and leave.
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    router.back();
  }, [router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <Text style={{ color: '#94a3b8' }}>Loading...</Text>
      </View>
    );
  }

  if (!pluse) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <Text style={{ color: '#64748b' }}>Pluse not found</Text>
        <Pressable onPress={() => router.replace('/')} style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: '#6366f1', fontWeight: '500' }}>Back to Today</Text>
        </Pressable>
      </View>
    );
  }

  if (isCompleted) {
    const totalSeconds = expandedIntervals.reduce((s, d) => s + d, 0);
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Ionicons name="flash" size={40} color="#22c55e" />
        </View>
        <Text style={{ fontSize: 24, fontWeight: '600', color: '#0f172a' }}>Pluse Complete!</Text>
        <Text style={{ color: '#64748b', marginTop: 4 }}>
          You completed{' '}
          <Text style={{ fontWeight: '500', color: '#334155' }}>{pluse.name}</Text>
        </Text>
        <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
          {formatSeconds(totalSeconds)} total
        </Text>

        <View style={{ width: '100%', marginTop: 32, gap: 12 }}>
          <Pressable
            onPress={restart}
            style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366f1', paddingVertical: 12, borderRadius: 12 }}
          >
            <Ionicons name="refresh" size={18} color="white" />
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>Run Again</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/')}
            style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: '#475569', fontSize: 14, fontWeight: '500' }}>Back to Today</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Pressable onPress={handleBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chevron-back" size={18} color="#94a3b8" />
          <Text style={{ fontSize: 14, color: '#64748b' }}>Back</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: '#94a3b8' }}>
          {currentIndex + 1} / {totalItems}
        </Text>
      </View>

      {/* Title */}
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#0f172a' }}>{pluse.name}</Text>
        <Text style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>
          Interval {currentIndex + 1} of {totalItems} · {formatSeconds(currentDuration)}
        </Text>
      </View>

      {/* Timer Ring */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <TimerRing progress={progress}>
          <Text style={{ fontSize: 48, fontFamily: 'monospace', fontWeight: '600', color: '#0f172a', letterSpacing: -2 }}>
            {formatTime(remainingSeconds)}
          </Text>
        </TimerRing>
      </View>

      {/* Controls */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
        <Pressable
          onPress={toggleRunning}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: isRunning ? '#fffbeb' : '#6366f1',
            borderWidth: isRunning ? 1 : 0,
            borderColor: isRunning ? '#fcd34d' : 'transparent',
          }}
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={18} color={isRunning ? '#d97706' : 'white'} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: isRunning ? '#d97706' : 'white' }}>
            {isRunning ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
          </Text>
        </Pressable>

        <Pressable
          onPress={skipToNext}
          disabled={currentIndex >= totalItems - 1}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: '#e2e8f0',
            opacity: currentIndex >= totalItems - 1 ? 0.4 : 1,
          }}
        >
          <Ionicons name="play-skip-forward" size={18} color="#475569" />
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>Skip</Text>
        </Pressable>

        {elapsed > 0 ? (
          <Pressable onPress={restart} style={{ padding: 12 }}>
            <Ionicons name="refresh" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
