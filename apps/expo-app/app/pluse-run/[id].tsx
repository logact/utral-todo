import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { getPluse } from '@/lib/pluse';
import {
  createTimerSession,
  updateTimerSession,
  deleteTimerSession,
  getActiveTimerSession,
  getActiveTimerState,
  setActiveTimerState,
} from '@/lib/database';
import {
  hapticImpact,
  hapticNotification,
  scheduleNotification,
  cancelAllNotifications,
  requestNotificationPermission,
} from '@/lib/native';
import type { Pluse, TimerSession } from '@/lib/database';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
  const queryClient = useQueryClient();

  const [pluse, setPluse] = useState<Pluse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<TimerSession | null>(null);
  const hasStartedRef = useRef(false);
  const currentDurationRef = useRef(0);
  const currentIndexRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const isRunningRef = useRef(false);
  const pluseRef = useRef(pluse);
  const expandedIntervalsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    
    Promise.all([
      getPluse(id),
      getActiveTimerSession(),
      getActiveTimerState(),
    ]).then(([p, session, timerState]) => {
      setPluse(p);
      
      if (timerState && timerState.pluseId === id) {
        sessionRef.current = session;
        setCurrentIndex(timerState.currentIndex);
        setElapsedSeconds(timerState.elapsedSeconds);
        if (timerState.isRunning) {
          setIsRunning(true);
        }
        setActiveTimerState(null);
      } else if (session && session.pluseId === id) {
        sessionRef.current = session;
        setCurrentIndex(session.currentIndex);
        setElapsedSeconds(session.elapsedSeconds);
        if (session.status === 'running') {
          setIsRunning(true);
        }
      }
      setIsLoading(false);
    });
  }, [id]);

  const expandedIntervals = pluse ? expandIntervals(pluse.intervals, pluse.repeatCount) : [];
  const currentDuration = expandedIntervals[currentIndex] || 0;

  useEffect(() => {
    currentDurationRef.current = currentDuration;
    pluseRef.current = pluse;
    expandedIntervalsRef.current = expandedIntervals;
    currentIndexRef.current = currentIndex;
    elapsedSecondsRef.current = elapsedSeconds;
    isRunningRef.current = isRunning;
  });

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    return () => {
      cancelAllNotifications();
    };
  }, []);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          const duration = currentDurationRef.current;
          const p = pluseRef.current;
          const intervals = expandedIntervalsRef.current;
          elapsedSecondsRef.current = next;

          if (duration > 0 && next >= duration) {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;

            hapticNotification('success');

            setCurrentIndex((idx) => {
              const nextIdx = idx < intervals.length - 1 ? idx + 1 : 0;
              currentIndexRef.current = nextIdx;
              
              if (idx < intervals.length - 1) {
                scheduleNotification(
                  `${p?.name} — Interval ${idx + 1} complete`,
                  `Interval ${idx + 2} of ${intervals.length} is next.`,
                  1
                );
                if (p?.autoAdvance !== false) {
                  setTimeout(() => setIsRunning(true), 2000);
                }
                return idx + 1;
              } else {
                setIsCompleted(true);
                if (p?.autoAdvance !== false) {
                  scheduleNotification(`${p?.name} — Complete!`, 'All intervals finished. Great work!', 1);
                  sessionRef.current?.id &&
                    updateTimerSession(sessionRef.current.id, {
                      status: 'completed',
                      completedAt: new Date().toISOString(),
                    }).catch(() => {});
                }
                return 0;
              }
            });

            setIsRunning(false);
            return 0;
          }
          return next;
        });
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

  const toggleRunning = useCallback(async () => {
    hapticImpact();

    if (isRunning) {
      setIsRunning(false);
      if (sessionRef.current) {
        await updateTimerSession(sessionRef.current.id, {
          elapsedSeconds,
          status: 'paused',
          pausedAt: new Date().toISOString(),
        });
      }
    } else {
      if (!sessionRef.current && pluse) {
        const session = await createTimerSession({
          name: pluse.name,
          pluseId: pluse.id,
          intervals: pluse.intervals,
          repeatCount: pluse.repeatCount,
          status: 'running',
          startedAt: new Date().toISOString(),
          currentIndex,
          elapsedSeconds,
        });
        sessionRef.current = session;
      } else if (sessionRef.current) {
        await updateTimerSession(sessionRef.current.id, {
          status: 'running',
          startedAt: new Date().toISOString(),
          pausedAt: undefined,
        });
      }

      hasStartedRef.current = true;
      setIsRunning(true);
    }
  }, [isRunning, pluse, elapsedSeconds, currentIndex]);

  const skipToNext = useCallback(() => {
    if (currentIndex >= expandedIntervals.length - 1) return;
    setCurrentIndex((prev) => prev + 1);
    setElapsedSeconds(0);
    setIsRunning(false);
    hapticImpact();
  }, [currentIndex, expandedIntervals.length]);

  const restart = useCallback(async () => {
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    hasStartedRef.current = false;
    hapticImpact();
    cancelAllNotifications();
    if (sessionRef.current) {
      await deleteTimerSession(sessionRef.current.id);
      sessionRef.current = null;
    }
  }, []);

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
            onPress={() => {
              setActiveTimerState(null).then(() => router.replace('/'));
            }}
            style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: '#475569', fontSize: 14, fontWeight: '500' }}>Back to Today</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const totalItems = expandedIntervals.length;
  const remainingSeconds = Math.max(0, currentDuration - elapsedSeconds);
  const progress = currentDuration > 0 ? elapsedSeconds / currentDuration : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Pressable onPress={() => {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setActiveTimerState({
            pluseId: id || '',
            currentIndex: currentIndexRef.current,
            elapsedSeconds: elapsedSecondsRef.current,
            isRunning: isRunningRef.current,
          }).then(() => router.back());
        }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
            {isRunning ? 'Pause' : elapsedSeconds > 0 ? 'Resume' : 'Start'}
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

        {elapsedSeconds > 0 ? (
          <Pressable onPress={restart} style={{ padding: 12 }}>
            <Ionicons name="refresh" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
