import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getTodayTodos,
  getInProgressTodos,
  getOverdueTodos,
  getTodayGoals,
  getUnscheduledHighPriorityTodos,
  updateTodoStatus,
  createTodo,
} from '@/lib/todos';
import { getAllPluses } from '@/lib/pluse';
import { hapticImpact, hapticNotification, scheduleNotification, requestNotificationPermission } from '@/lib/native';
import { createTimerSession, updateTimerSession, getActiveTimerSession, deleteTimerSession, setActiveTimerState, getActiveTimerState } from '@/lib/database';
import type { Todo, Pluse, TimerSession } from '@/lib/database';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

function TodoItem({
  todo,
  onToggle,
  onFocus,
  onPress,
}: {
  todo: Todo;
  onToggle: () => void;
  onFocus?: () => void;
  onPress: () => void;
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginHorizontal: -12,
        borderRadius: 12,
      }}
    >
      <Pressable onPress={onToggle} style={{ marginTop: 2, marginRight: 12 }}>
        {isDone ? (
          <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color="#cbd5e1" />
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          if (canFocus && onFocus) {
            onFocus();
          } else {
            onPress();
          }
        }}
        style={{ flex: 1 }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '500',
            color: isDone ? '#94a3b8' : '#0f172a',
            textDecorationLine: isDone ? 'line-through' : 'none',
          }}
          numberOfLines={1}
        >
          {todo.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {todo.scheduledDate ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={12} color="#94a3b8" />
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                {new Date(todo.scheduledDate).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 12, fontWeight: '500', color: priorityColor === 'text-rose-500' ? '#f43f5e' : priorityColor === 'text-amber-500' ? '#f59e0b' : '#94a3b8' }}>
            {todo.priority}
          </Text>
          {isInProgress ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="flash" size={12} color="#f59e0b" />
              <Text style={{ fontSize: 12, color: '#f59e0b' }}>In Progress</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function PluseMiniTimer({
  pluse,
  onClose,
  onRequireTask,
  onPress,
}: {
  pluse: Pluse;
  onClose: () => void;
  onRequireTask: () => void;
  onPress?: () => void;
}) {
  const expandedIntervals: number[] = [];
  for (let r = 0; r < pluse.repeatCount; r++) {
    expandedIntervals.push(...pluse.intervals);
  }
  const totalItems = expandedIntervals.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDurationRef = useRef(0);
  const currentIndexRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const isRunningRef = useRef(false);
  const sessionRef = useRef<TimerSession | null>(null);

  const currentDuration = expandedIntervals[currentIndex] || 0;
  const remainingSeconds = Math.max(0, currentDuration - elapsedSeconds);

  useEffect(() => {
    currentDurationRef.current = currentDuration;
    currentIndexRef.current = currentIndex;
    elapsedSecondsRef.current = elapsedSeconds;
    isRunningRef.current = isRunning;
  });

  useEffect(() => {
    getActiveTimerState().then((timerState) => {
      if (timerState && timerState.pluseId === pluse.id) {
        setCurrentIndex(timerState.currentIndex);
        setElapsedSeconds(timerState.elapsedSeconds);
        if (timerState.isRunning) {
          setIsRunning(true);
        }
        setActiveTimerState(null);
      } else {
        getActiveTimerSession().then((session) => {
          if (session && session.pluseId === pluse.id) {
            sessionRef.current = session;
            setCurrentIndex(session.currentIndex);
            setElapsedSeconds(session.elapsedSeconds);
            if (session.status === 'running') {
              setIsRunning(true);
            }
          }
        });
      }
    });
  }, [pluse.id]);

  useFocusEffect(
    useCallback(() => {
      getActiveTimerState().then((timerState) => {
        if (timerState && timerState.pluseId === pluse.id) {
          setCurrentIndex(timerState.currentIndex);
          setElapsedSeconds(timerState.elapsedSeconds);
          setActiveTimerState(null);
          if (timerState.isRunning) {
            setIsRunning(false);
            setTimeout(() => setIsRunning(true), 50);
          }
        }
      });
    }, [pluse.id])
  );

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (isCompleted || !isRunning) return;
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        const duration = currentDurationRef.current;
        elapsedSecondsRef.current = next;

        if (duration > 0 && next >= duration) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;

          hapticNotification('success');

          setCurrentIndex((idx) => {
            const nextIdx = idx < totalItems - 1 ? idx + 1 : 0;
            const completed = idx >= totalItems - 1;
            currentIndexRef.current = nextIdx;

            if (sessionRef.current) {
              if (completed) {
                updateTimerSession(sessionRef.current.id, {
                  status: 'completed',
                  completedAt: new Date().toISOString(),
                }).catch(() => {});
              } else {
                updateTimerSession(sessionRef.current.id, {
                  currentIndex: nextIdx,
                  elapsedSeconds: 0,
                  status: pluse.autoAdvance !== false ? 'running' : 'paused',
                }).catch(() => {});
              }
            }

            if (idx < totalItems - 1) {
              scheduleNotification(
                `${pluse.name} — Interval ${idx + 1} complete`,
                `Interval ${idx + 2} of ${totalItems} is next.`,
                1
              );
              if (pluse.autoAdvance !== false) {
                timeoutRef.current = setTimeout(() => {
                  setIsRunning(true);
                  hapticImpact();
                }, 2000);
              }
              return idx + 1;
            } else {
              setIsCompleted(true);
              scheduleNotification(`${pluse.name} — Complete!`, 'All intervals finished. Great work!', 1);
              return 0;
            }
          });

          setIsRunning(false);
          return 0;
        }

        if (sessionRef.current && next % 5 === 0) {
          updateTimerSession(sessionRef.current.id, {
            elapsedSeconds: next,
            currentIndex: currentIndexRef.current,
            status: 'running',
          }).catch(() => {});
        }

        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isCompleted]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (sessionRef.current && isRunningRef.current) {
        updateTimerSession(sessionRef.current.id, {
          status: 'running',
          currentIndex: currentIndexRef.current,
          elapsedSeconds: elapsedSecondsRef.current,
        }).catch(() => {});
      }
    };
  }, []);

  const toggleRunning = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isCompleted) {
      onRequireTask();
      return;
    }

    const newRunning = !isRunning;
    if (newRunning) {
      if (!sessionRef.current) {
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
      } else {
        await updateTimerSession(sessionRef.current.id, {
          status: 'running',
        });
      }
    } else {
      if (sessionRef.current) {
        await updateTimerSession(sessionRef.current.id, {
          status: 'paused',
          currentIndex,
          elapsedSeconds,
        });
      }
    }

    setIsRunning(newRunning);
    hapticImpact();
  }, [isRunning, isCompleted, onRequireTask, pluse, currentIndex, elapsedSeconds]);

  const restart = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (sessionRef.current) {
      await deleteTimerSession(sessionRef.current.id);
      sessionRef.current = null;
    }
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    hapticImpact();
  }, []);

  const skipToNext = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (currentIndex >= totalItems - 1) return;
    setCurrentIndex((prev) => prev + 1);
    setElapsedSeconds(0);
    setIsRunning(false);
    hapticImpact();
  }, [currentIndex, totalItems]);

  if (isCompleted) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Text style={{ fontSize: 30, fontWeight: '600', color: '#0f172a' }}>Done!</Text>
        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{pluse.name} complete</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={restart}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#6366f1' }}
          >
            <Ionicons name="refresh" size={14} color="white" />
            <Text style={{ fontSize: 12, fontWeight: '500', color: 'white' }}>Again</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#475569' }}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      <Pressable onPress={() => {
        if (onPress) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setActiveTimerState({
            pluseId: pluse.id,
            currentIndex: currentIndexRef.current,
            elapsedSeconds: elapsedSecondsRef.current,
            isRunning: isRunningRef.current,
          }).then(() => onPress());
        }
      }} disabled={!onPress}>
        <Text style={{ fontSize: 42, fontFamily: 'monospace', fontWeight: '600', color: '#0f172a', letterSpacing: -1 }}>
          {formatCountdown(remainingSeconds)}
        </Text>
        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          Interval {currentIndex + 1} of {totalItems} · {formatSeconds(currentDuration)}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
        <Pressable
          onPress={toggleRunning}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: isRunning ? '#fffbeb' : '#6366f1',
            borderWidth: isRunning ? 1 : 0,
            borderColor: isRunning ? '#fcd34d' : 'transparent',
          }}
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={14} color={isRunning ? '#d97706' : 'white'} />
          <Text style={{ fontSize: 12, fontWeight: '500', color: isRunning ? '#d97706' : 'white' }}>
            {isRunning ? 'Pause' : elapsedSeconds > 0 ? 'Resume' : 'Start'}
          </Text>
        </Pressable>

        <Pressable
          onPress={skipToNext}
          disabled={currentIndex >= totalItems - 1}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: '#e2e8f0',
            opacity: currentIndex >= totalItems - 1 ? 0.4 : 1,
          }}
        >
          <Ionicons name="play-skip-forward" size={14} color="#64748b" />
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#475569' }}>Skip</Text>
        </Pressable>

        {elapsedSeconds > 0 ? (
          <Pressable onPress={restart} style={{ padding: 8 }}>
            <Ionicons name="refresh" size={14} color="#94a3b8" />
          </Pressable>
        ) : null}

        <Pressable onPress={onClose} style={{ padding: 8 }}>
          <Ionicons name="close" size={14} color="#94a3b8" />
        </Pressable>
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [activePluseIndex, setActivePluseIndex] = useState(0);
  const [showPlusePicker, setShowPlusePicker] = useState(false);

  const { data: todayTodos = [] } = useQuery({
    queryKey: ['todos', 'today'],
    queryFn: getTodayTodos,
  });

  const { data: inProgress = [] } = useQuery({
    queryKey: ['todos', 'inProgress'],
    queryFn: getInProgressTodos,
  });

  const { data: overdue = [] } = useQuery({
    queryKey: ['todos', 'overdue'],
    queryFn: getOverdueTodos,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['todos', 'goals'],
    queryFn: getTodayGoals,
  });

  const { data: suggested = [] } = useQuery({
    queryKey: ['todos', 'suggested'],
    queryFn: getUnscheduledHighPriorityTodos,
  });

  const { data: pluses = [] } = useQuery({
    queryKey: ['pluses'],
    queryFn: getAllPluses,
  });

  const createMutation = useMutation({
    mutationFn: () => createTodo({ title: quickTitle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setQuickTitle('');
      setQuickOpen(false);
    },
  });

  const toggleStatus = useCallback(
    async (todo: Todo) => {
      const newStatus = todo.status === 'done' ? 'pending' : 'done';
      await updateTodoStatus(todo.id, newStatus);
      hapticImpact();
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    [queryClient]
  );

  const setFocus = useCallback(
    async (todo: Todo) => {
      await updateTodoStatus(todo.id, 'in_progress');
      hapticImpact();
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    [queryClient]
  );

  const seen = new Set<string>();
  const allTodos = [
    ...overdue,
    ...inProgress,
    ...goals,
    ...suggested,
    ...todayTodos.filter((t) => t.status !== 'in_progress'),
  ].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  const doneCount = allTodos.filter((t) => t.status === 'done').length;
  const totalCount = allTodos.length;
  const currentTodo = inProgress[0];
  const pendingCount = allTodos.filter((t) => t.status === 'pending').length;
  const activePluse = pluses[activePluseIndex] || null;

  const handleQuickCreate = () => {
    if (!quickTitle.trim()) return;
    createMutation.mutate();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 100 }}
      >
        {/* Stats */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: inProgress.length > 0 ? '#fbbf24' : totalCount > doneCount ? '#818cf8' : '#34d399',
                }}
              />
              <Text style={{ fontSize: 14, color: '#64748b' }}>
                {inProgress.length > 0
                  ? `${inProgress.length} in progress`
                  : totalCount > doneCount
                    ? `${totalCount - doneCount} left`
                    : 'All done'}
              </Text>
            </View>
            {doneCount > 0 ? (
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                {doneCount} done
              </Text>
            ) : null}
          </View>
        </View>

        {/* Focus Session Card */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          {pluses.length > 0 ? (
            <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
              <PluseMiniTimer
                key={`${activePluse?.id}-${activePluseIndex}`}
                pluse={activePluse!}
                onClose={() => setActivePluseIndex(0)}
                onRequireTask={() => {
                  if (pendingCount > 0) {
                    setQuickOpen(true);
                  }
                }}
                onPress={() => router.push(`/pluse-run/${activePluse!.id}`)}
              />
              {pluses.length > 1 ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <Pressable
                    onPress={() => setShowPlusePicker(!showPlusePicker)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 11, color: '#64748b' }}>
                      {activePluse?.name ?? 'Select pluse'}
                    </Text>
                    <Ionicons name={showPlusePicker ? 'chevron-up' : 'chevron-down'} size={12} color="#94a3b8" />
                  </Pressable>
                  {showPlusePicker ? (
                    <View style={{ marginTop: 4, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                      {pluses.map((p, idx) => {
                        const totalSec = p.intervals.reduce((s, d) => s + d, 0) * p.repeatCount;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => {
                              setActivePluseIndex(idx);
                              setShowPlusePicker(false);
                              hapticImpact();
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              backgroundColor: idx === activePluseIndex ? '#eef2ff' : 'transparent',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                flex: 1,
                                color: idx === activePluseIndex ? '#4f46e5' : '#334155',
                                fontWeight: idx === activePluseIndex ? '500' : '400',
                              }}
                              numberOfLines={1}
                            >
                              {p.name}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                              {formatSeconds(totalSec)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/pluses')}
              style={{
                backgroundColor: 'white',
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#cbd5e1',
                padding: 16,
                alignItems: 'center',
              }}
            >
              <Ionicons name="timer-outline" size={20} color="#94a3b8" />
              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>No pluses yet</Text>
              <Text style={{ fontSize: 12, color: '#6366f1', fontWeight: '500', marginTop: 2 }}>
                Create your first pluse
              </Text>
            </Pressable>
          )}
        </View>

        {/* Current Task Card */}
        {currentTodo ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#fed7aa', padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fbbf24' }} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#d97706', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Current Focus
                </Text>
              </View>
              <Pressable onPress={() => router.push(`/todo/${currentTodo.id}`)}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#0f172a' }}>
                  {currentTodo.title}
                </Text>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => toggleStatus(currentTodo)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ecfdf5' }}
                >
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#16a34a' }}>Mark done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* Todo list */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            {allTodos.length > 0 ? 'Tasks' : ''}
          </Text>
          {allTodos.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Ionicons name="flag-outline" size={32} color="#cbd5e1" />
              <Text style={{ marginTop: 12, fontSize: 14, color: '#94a3b8' }}>
                No tasks for today
              </Text>
              <Pressable onPress={() => setQuickOpen(true)} style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 14, color: '#6366f1', fontWeight: '500' }}>
                  Add your first task
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {allTodos.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => toggleStatus(todo)}
                  onFocus={() => setFocus(todo)}
                  onPress={() => router.push(`/todo/${todo.id}`)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Quick Create FAB */}
      <Pressable
        onPress={() => setQuickOpen(true)}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 80 + insets.bottom,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#6366f1',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#6366f1',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Ionicons name="flash" size={22} color="white" />
      </Pressable>

      {/* Quick Create Modal */}
      <Modal visible={quickOpen} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setQuickOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              paddingBottom: insets.bottom + 16,
            }}
            onPress={(e: any) => e.stopPropagation?.()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#0f172a' }}>
                Quick Add
              </Text>
              <Pressable onPress={() => setQuickOpen(false)} style={{ padding: 8 }}>
                <Ionicons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <TextInput
              style={{
                width: '100%',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: '#f1f5f9',
                fontSize: 16,
                color: '#0f172a',
              }}
              placeholder="What needs to be done?"
              placeholderTextColor="#94a3b8"
              value={quickTitle}
              onChangeText={setQuickTitle}
              autoFocus
              onSubmitEditing={handleQuickCreate}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Pressable
                onPress={handleQuickCreate}
                disabled={!quickTitle.trim()}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: '#6366f1',
                  opacity: quickTitle.trim() ? 1 : 0.5,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '500', fontSize: 14 }}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
