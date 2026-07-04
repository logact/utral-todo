import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_TIME_SLOTS,
  getTimeSlotForTodo,
  type TimeSlotConfig,
  type Todo,
  type Pluse,
} from '@utral/types';
import {
  getTodaysTodos,
  getInProgressTodos,
  getOverdueTodos,
  getTodaysGoals,
  getUnscheduledHighPriorityTodos,
  updateTodoStatus,
  createTodo,
  updateTodoSchedule,
} from '@utral/db-schema/todo-ops';
import {
  getAllPluses,
  startPluseTimer,
  pausePluseTimer,
  resumePluseTimer,
  stopPluseTimer,
  advancePluseTimer,
  getElapsedSeconds,
  getActivePluseTimer,
} from '@utral/db-schema/pluse-ops';
import { extractAtSchedule, formatSchedulePreview } from '@/lib/atSchedule';
import {
  getTimeSlotDefinitions,
  ensureTimeSlotTodo,
} from '@utral/db-schema/timeslots';
import { dbStore } from '@/lib/db-store';
import { hapticImpact, hapticNotification, scheduleNotification, requestNotificationPermission } from '@/lib/native';
import { useDbChangeRefresh } from '@/hooks/useDbChangeRefresh';
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

function formatTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const slotIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  'slot-morning': 'flag',
  'slot-midday': 'checkmark-circle',
  'slot-afternoon': 'flag',
  'slot-late-afternoon': 'checkmark-circle',
  'slot-evening': 'flag',
  'slot-night': 'checkmark-circle',
};

const slotColors: Record<string, { bg: string; text: string }> = {
  'slot-morning': { bg: '#eef2ff', text: '#4f46e5' },
  'slot-midday': { bg: '#ecfdf5', text: '#059669' },
  'slot-afternoon': { bg: '#eef2ff', text: '#4f46e5' },
  'slot-late-afternoon': { bg: '#ecfdf5', text: '#059669' },
  'slot-evening': { bg: '#eef2ff', text: '#4f46e5' },
  'slot-night': { bg: '#ecfdf5', text: '#059669' },
};

function CompactTodoRow({
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

  return (
    <Pressable
      onPress={() => {
        if (canFocus && onFocus) {
          onFocus();
        } else {
          onPress();
        }
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: isInProgress ? '#fffbeb' : 'transparent',
      }}
    >
      <Pressable onPress={onToggle} style={{ marginRight: 10 }}>
        {isDone ? (
          <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
        ) : (
          <Ionicons name="ellipse-outline" size={18} color="#cbd5e1" />
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: isInProgress ? '600' : '400',
            color: isDone ? '#94a3b8' : '#0f172a',
            textDecorationLine: isDone ? 'line-through' : 'none',
          }}
          numberOfLines={1}
        >
          {todo.title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {todo.scheduledDate ? (
          <Text style={{ fontSize: 11, color: '#94a3b8' }}>
            {formatTime(todo.scheduledDate)}
          </Text>
        ) : null}
        {todo.priority === 'high' ? (
          <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: '#fef2f2' }}>
            <Text style={{ fontSize: 10, color: '#ef4444' }}>H</Text>
          </View>
        ) : null}
        {isInProgress ? (
          <Ionicons name="flash" size={12} color="#f59e0b" />
        ) : null}
      </View>
    </Pressable>
  );
}

function TimeSlotSection({
  config,
  todos,
  isCollapsed,
  onToggleCollapse,
  onToggle,
  onFocus,
  onPress,
}: {
  config: TimeSlotConfig;
  todos: Todo[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggle: (todo: Todo) => void;
  onFocus: (todo: Todo) => void;
  onPress: (todo: Todo) => void;
}) {
  const colors = slotColors[config.id] ?? { bg: '#f1f5f9', text: '#64748b' };
  const icon = slotIcons[config.id] ?? 'ellipse-outline';

  return (
    <View style={{ marginBottom: 4 }}>
      <Pressable
        onPress={onToggleCollapse}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 4,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bg,
            marginRight: 10,
          }}
        >
          <Ionicons name={icon} size={14} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e293b' }}>
              {config.title}
            </Text>
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 10, color: '#64748b' }}>{config.time}</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {todos.length > 0 ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 10, color: '#64748b' }}>{todos.length}</Text>
            </View>
          ) : null}
          <Ionicons
            name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
            size={14}
            color="#94a3b8"
          />
        </View>
      </Pressable>
      {!isCollapsed && todos.length > 0 ? (
        <View style={{ marginLeft: 14, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: '#e2e8f0' }}>
          {todos.map((todo) => (
            <CompactTodoRow
              key={todo.id}
              todo={todo}
              onToggle={() => onToggle(todo)}
              onFocus={() => onFocus(todo)}
              onPress={() => onPress(todo)}
            />
          ))}
        </View>
      ) : null}
      {!isCollapsed && todos.length === 0 ? (
        <View style={{ marginLeft: 14, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: '#e2e8f0', paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No tasks scheduled</Text>
        </View>
      ) : null}
    </View>
  );
}

function PluseMiniTimer({
  pluse,
  onClose,
  onPress,
}: {
  pluse: Pluse;
  onClose: () => void;
  onPress?: () => void;
}) {
  const expandedIntervals = useMemo(() => {
    const result: number[] = [];
    for (let r = 0; r < pluse.repeatCount; r++) result.push(...pluse.intervals);
    return result;
  }, [pluse.intervals, pluse.repeatCount]);
  const totalItems = expandedIntervals.length;

  const [currentIndex, setCurrentIndex] = useState(pluse.currentIntervalIndex);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(pluse.timerStatus === 'running');
  const [isCompleted, setIsCompleted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(
    pluse.timerStatus === 'running' && pluse.startedAt ? new Date(pluse.startedAt).getTime() : null
  );

  const [, forceTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reconstruct local state from the persisted pluse row (authoritative).
  const syncFromDb = useCallback(async () => {
    const active = await getActivePluseTimer(dbStore);
    if (!active || active.id !== pluse.id) {
      setIsRunning(false);
      setIsCompleted(false);
      setCurrentIndex(0);
      setElapsedSeconds(0);
      setStartTime(null);
      return;
    }

    setCurrentIndex(active.currentIntervalIndex);
    setIsRunning(active.timerStatus === 'running');

    if (active.timerStatus === 'running' && active.startedAt) {
      const totalElapsed = getElapsedSeconds(active);
      let idx = active.currentIntervalIndex;
      let e = totalElapsed;
      while (idx < totalItems) {
        const dur = expandedIntervals[idx];
        if (e < dur) break;
        e -= dur;
        idx++;
      }
      if (idx >= totalItems) {
        setCurrentIndex(totalItems - 1);
        setElapsedSeconds(expandedIntervals[totalItems - 1] ?? 0);
        setIsRunning(false);
        setIsCompleted(true);
        setStartTime(null);
        await stopPluseTimer(dbStore, pluse.id);
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
  }, [pluse.id, expandedIntervals, totalItems]);

  useEffect(() => {
    syncFromDb();
  }, [syncFromDb]);

  // Re-sync when the tab regains focus (e.g. returning from full-screen run).
  useFocusEffect(
    useCallback(() => {
      syncFromDb();
    }, [syncFromDb])
  );

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const getElapsed = useCallback(() => {
    if (!isRunning || !startTime) return elapsedSeconds;
    return elapsedSeconds + Math.floor((Date.now() - startTime) / 1000);
  }, [isRunning, elapsedSeconds, startTime]);

  const currentDuration = expandedIntervals[currentIndex] || 0;
  const elapsed = getElapsed();
  const remainingSeconds = Math.max(0, currentDuration - elapsed);

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

  // Clear pending auto-advance timeout when running resumes.
  useEffect(() => {
    if (isRunning && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isRunning]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Check completion / auto-advance.
  useEffect(() => {
    if (isCompleted || !isRunning) return;
    const shouldAutoAdvance = pluse.autoAdvance !== false;
    if (elapsed >= currentDuration) {
      hapticNotification('success');
      if (currentIndex < totalItems - 1) {
        const nextIndex = currentIndex + 1;
        setIsRunning(false);
        setCurrentIndex(nextIndex);
        setElapsedSeconds(0);
        setStartTime(null);
        pausePluseTimer(dbStore, pluse.id, 0, nextIndex).catch(() => {});

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
            resumePluseTimer(dbStore, pluse.id).catch(() => {});
            hapticImpact();
          }, 2000);
        }
      } else {
        setIsRunning(false);
        setIsCompleted(true);
        setStartTime(null);
        stopPluseTimer(dbStore, pluse.id).catch(() => {});
        scheduleNotification(`${pluse.name} — Complete!`, 'All intervals finished. Great work!', 1);
      }
    }
  }, [elapsed, isRunning, isCompleted, currentIndex, totalItems, currentDuration, pluse.id, pluse.name, pluse.autoAdvance]);

  const toggleRunning = useCallback(async () => {
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
      await startPluseTimer(dbStore, pluse.id);
      return;
    }

    if (isRunning) {
      const total = elapsedSeconds + (startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
      setIsRunning(false);
      setElapsedSeconds(total);
      setStartTime(null);
      await pausePluseTimer(dbStore, pluse.id, total, currentIndex);
    } else {
      setIsRunning(true);
      setStartTime(Date.now());
      // First-ever start (idle) resets progress; otherwise resume where paused.
      if (pluse.timerStatus === 'idle' && elapsedSeconds === 0 && currentIndex === 0) {
        await startPluseTimer(dbStore, pluse.id);
      } else {
        await resumePluseTimer(dbStore, pluse.id);
      }
    }
  }, [isRunning, isCompleted, elapsedSeconds, startTime, currentIndex, pluse.id, pluse.timerStatus]);

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
    hapticImpact();
    await advancePluseTimer(dbStore, pluse.id, nextIndex);
  }, [currentIndex, totalItems, pluse.id]);

  const restart = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    await stopPluseTimer(dbStore, pluse.id);
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsCompleted(false);
    setStartTime(null);
    hapticImpact();
  }, [pluse.id]);

  const handleOpen = useCallback(() => {
    if (!onPress) return;
    // Freeze this timer locally; the pluse DB row stays authoritative and the
    // full-screen run reads from it. We re-sync on focus when returning.
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsRunning(false);
    onPress();
  }, [onPress]);

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
      <Pressable onPress={handleOpen} disabled={!onPress}>
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
            {isRunning ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
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

        {elapsed > 0 ? (
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

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
    queryClient.invalidateQueries({ queryKey: ['pluses'] });
    queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
  }, [queryClient]);
  useDbChangeRefresh(refreshAll, { tables: ['todos', 'pluses', 'timeSlots'] });

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [activePluseIndex, setActivePluseIndex] = useState(0);
  const [showPlusePicker, setShowPlusePicker] = useState(false);
  const [collapsedSlots, setCollapsedSlots] = useState<Set<string>>(new Set());

  const { data: todayTodos = [] } = useQuery({
    queryKey: ['todos', 'today'],
    queryFn: () => getTodaysTodos(dbStore),
  });

  const { data: inProgress = [] } = useQuery({
    queryKey: ['todos', 'inProgress'],
    queryFn: () => getInProgressTodos(dbStore),
  });

  const { data: overdue = [] } = useQuery({
    queryKey: ['todos', 'overdue'],
    queryFn: () => getOverdueTodos(dbStore),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['todos', 'goals'],
    queryFn: () => getTodaysGoals(dbStore),
  });

  const { data: suggested = [] } = useQuery({
    queryKey: ['todos', 'suggested'],
    queryFn: () => getUnscheduledHighPriorityTodos(dbStore),
  });

  const { data: pluses = [] } = useQuery({
    queryKey: ['pluses'],
    queryFn: () => getAllPluses(dbStore),
  });

  const { data: timeSlotDefs = [] } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: () => getTimeSlotDefinitions(dbStore),
  });

  // DB-driven slot definitions, falling back to the shared defaults until they load.
  const slots: TimeSlotConfig[] = timeSlotDefs.length > 0 ? timeSlotDefs : DEFAULT_TIME_SLOTS;

  // Ensure boundary milestone todos exist for the current definitions and that
  // their scheduledDate is anchored to today. The initial creation already
  // happened in bootstrapApp; this effect handles the daily refresh.
  useEffect(() => {
    if (timeSlotDefs.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const slot of timeSlotDefs) {
        await ensureTimeSlotTodo(dbStore, slot);
      }
      if (!cancelled) queryClient.invalidateQueries({ queryKey: ['todos'] });
    })().catch((err) => console.error('[timeSlots] ensure failed:', err));
    return () => {
      cancelled = true;
    };
  }, [timeSlotDefs, queryClient]);

  const createMutation = useMutation({
    mutationFn: () => {
      const { title, scheduledDate } = extractAtSchedule(quickTitle);
      return createTodo(dbStore, title || quickTitle.trim(), { scheduledDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setQuickTitle('');
      setQuickOpen(false);
    },
  });

  const quickPreview = useMemo(() => extractAtSchedule(quickTitle), [quickTitle]);

  const toggleStatus = useCallback(
    async (todo: Todo) => {
      const newStatus = todo.status === 'done' ? 'pending' : 'done';
      await updateTodoStatus(dbStore, todo.id, newStatus);
      hapticImpact();
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    [queryClient]
  );

  const setFocus = useCallback(
    async (todo: Todo) => {
      await updateTodoStatus(dbStore, todo.id, 'in_progress');
      hapticImpact();
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    [queryClient]
  );

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

  const scheduleForToday = useCallback(
    async (todo: Todo) => {
      const now = new Date();
      now.setHours(9, 0, 0, 0);
      await updateTodoSchedule(dbStore, todo.id, now);
      hapticImpact();
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    [queryClient]
  );

  // Build time slot groups — mirrors desktop Today.tsx logic
  const { timeSlotGroups, activeTodos, doneTodos, totalActive } = useMemo(() => {
    const groups = new Map<string, Todo[]>();
    for (const slot of slots) {
      groups.set(slot.id, []);
    }

    const active: Todo[] = [];
    const done: Todo[] = [];
    const seenActive = new Set<string>();
    const seenDone = new Set<string>();

    function addDone(todo: Todo) {
      if (seenDone.has(todo.id)) return;
      seenDone.add(todo.id);
      done.push(todo);
    }

    function addActive(todo: Todo) {
      // Boundary milestone todos (pattern 'timeSlot' / system tasks) are never
      // shown in the task lists — they only anchor the slot sections.
      if (todo.isSystemTask || todo.pattern === 'timeSlot') return;
      if (todo.status === 'done') {
        addDone(todo);
        return;
      }
      if (seenActive.has(todo.id)) return;
      seenActive.add(todo.id);

      const slotId = getTimeSlotForTodo(todo as any, slots);
      if (slotId) {
        groups.get(slotId)!.push(todo);
      }
    }

    for (const todo of inProgress) addActive(todo);
    for (const todo of overdue) addActive(todo);
    for (const todo of todayTodos) addActive(todo);

    // Sort within each slot
    for (const [, list] of groups) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    // Build ordered active list for status display
    for (const todo of inProgress) {
      if (!active.find((t) => t.id === todo.id)) active.push(todo);
    }
    for (const todo of overdue) {
      if (!active.find((t) => t.id === todo.id)) active.push(todo);
    }
    for (const slot of slots) {
      for (const todo of groups.get(slot.id)!) {
        if (!active.find((t) => t.id === todo.id)) active.push(todo);
      }
    }

    return { timeSlotGroups: groups, activeTodos: active, doneTodos: done, totalActive: active.length };
  }, [todayTodos, inProgress, overdue, slots]);

  const currentTodo = inProgress[0];
  const activePluse = pluses[activePluseIndex] || null;
  const doneCount = doneTodos.length;

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
        {/* Status bar */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: inProgress.length > 0 ? '#fbbf24' : totalActive > 0 ? '#818cf8' : '#34d399',
                }}
              />
              <Text style={{ fontSize: 14, color: '#64748b' }}>
                {inProgress.length > 0
                  ? `${inProgress.length} in progress`
                  : totalActive > 0
                    ? `${totalActive} left`
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

        {/* Pluse Timer Card */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          {pluses.length > 0 ? (
            <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
              <PluseMiniTimer
                key={`${activePluse?.id}-${activePluseIndex}`}
                pluse={activePluse!}
                onClose={() => setActivePluseIndex(0)}
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

        {/* Current Focus Card */}
        {currentTodo ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
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

        {/* Goals */}
        {goals.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Today&apos;s Goals
            </Text>
            {goals.map((goal) => (
              <View key={goal.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Ionicons name="flag" size={14} color="#f59e0b" />
                <Text style={{ fontSize: 14, color: '#1e293b' }}>{goal.title}</Text>
                {goal.goalStatus ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#fef3c7' }}>
                    <Text style={{ fontSize: 10, color: '#d97706' }}>{goal.goalStatus}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Time Slot Sections */}
        <View style={{ paddingHorizontal: 16 }}>
          {slots.map((slot) => (
            <TimeSlotSection
              key={slot.id}
              config={slot}
              todos={timeSlotGroups.get(slot.id) ?? []}
              isCollapsed={collapsedSlots.has(slot.id)}
              onToggleCollapse={() => toggleSlotCollapse(slot.id)}
              onToggle={toggleStatus}
              onFocus={setFocus}
              onPress={(todo) => router.push(`/todo/${todo.id}`)}
            />
          ))}
        </View>

        {/* Suggested (unscheduled high priority) */}
        {suggested.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Suggested
            </Text>
            {suggested.slice(0, 3).map((todo) => (
              <View key={todo.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                <Ionicons name="bulb-outline" size={14} color="#8b5cf6" />
                <Text style={{ fontSize: 14, color: '#1e293b', flex: 1 }} numberOfLines={1}>
                  {todo.title}
                </Text>
                <Pressable
                  onPress={() => scheduleForToday(todo)}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#eef2ff' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#4f46e5' }}>Add</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Done todos */}
        {doneTodos.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Done ({doneTodos.length})
            </Text>
            {doneTodos.map((todo) => (
              <CompactTodoRow
                key={todo.id}
                todo={todo}
                onToggle={() => toggleStatus(todo)}
                onPress={() => router.push(`/todo/${todo.id}`)}
              />
            ))}
          </View>
        ) : null}

        {/* Empty state */}
        {totalActive === 0 && doneCount === 0 && suggested.length === 0 ? (
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
        ) : null}
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
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
                placeholder="What needs to be done?  (try @tomorrow, @friday 3pm)"
                placeholderTextColor="#94a3b8"
                value={quickTitle}
                onChangeText={setQuickTitle}
                autoFocus
                onSubmitEditing={handleQuickCreate}
              />
              {quickPreview.scheduledDate && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    marginTop: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: '#eef2ff',
                  }}
                >
                  <Ionicons name="calendar-outline" size={14} color="#6366f1" />
                  <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '500', color: '#6366f1' }}>
                    {formatSchedulePreview(quickPreview.scheduledDate)}
                  </Text>
                </View>
              )}
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
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
