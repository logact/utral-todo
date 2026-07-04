import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTodo, updateTodo, updateTodoStatus, deleteTodo } from '@utral/db-schema/todo-ops';
import { hapticImpact, scheduleNotification, cancelAllNotifications, requestNotificationPermission } from '@/lib/native';
import { dbStore } from '@/lib/db-store';
import { useDbChangeRefresh } from '@/hooks/useDbChangeRefresh';
import type { Todo } from '@utral/types';

export default function TodoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const refreshTodo = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todo', id] });
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  }, [queryClient, id]);
  useDbChangeRefresh(refreshTodo, { tables: ['todos'] });

  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleInput, setScheduleInput] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [dueInput, setDueInput] = useState('');

  const { data: todo, isLoading } = useQuery({
    queryKey: ['todo', id],
    queryFn: () => getTodo(dbStore, id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (todo?.scheduledDate) {
      const d = new Date(todo.scheduledDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setScheduleInput(d.toISOString().slice(0, 16));
    } else {
      setScheduleInput('');
    }
  }, [todo?.scheduledDate, showSchedulePicker]);

  useEffect(() => {
    if (todo?.dueDate) {
      const d = new Date(todo.dueDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setDueInput(d.toISOString().slice(0, 16));
    } else {
      setDueInput('');
    }
  }, [todo?.dueDate, showDuePicker]);

  const toggleStatus = useCallback(async () => {
    if (!todo) return;
    const newStatus = todo.status === 'done' ? 'pending' : 'done';
    await updateTodoStatus(dbStore, todo.id, newStatus);
    hapticImpact();
    queryClient.invalidateQueries({ queryKey: ['todo', id] });
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  }, [todo, id, queryClient]);

  const handleDelete = useCallback(() => {
    if (!todo) return;
    Alert.alert('Delete', 'Delete this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTodo(dbStore, todo.id);
          hapticImpact();
          queryClient.invalidateQueries({ queryKey: ['todos'] });
          router.back();
        },
      },
    ]);
  }, [todo, queryClient, router]);

  const saveSchedule = useCallback(async () => {
    if (!todo) return;
    const scheduledDate = scheduleInput ? new Date(scheduleInput) : undefined;
    await updateTodo(dbStore, todo.id, { scheduledDate });

    if (scheduledDate && scheduledDate > new Date() && reminderEnabled) {
      const permitted = await requestNotificationPermission();
      if (permitted) {
        const secondsUntil = Math.floor((scheduledDate.getTime() - Date.now()) / 1000);
        if (secondsUntil > 0) {
          await scheduleNotification(todo.title, 'Your scheduled task is ready', secondsUntil);
        }
      }
    }

    hapticImpact();
    queryClient.invalidateQueries({ queryKey: ['todo', id] });
    setShowSchedulePicker(false);
    setReminderEnabled(false);
  }, [todo, scheduleInput, reminderEnabled, id, queryClient]);

  const clearSchedule = useCallback(async () => {
    if (!todo) return;
    await updateTodo(dbStore, todo.id, { scheduledDate: undefined });
    await cancelAllNotifications();
    hapticImpact();
    queryClient.invalidateQueries({ queryKey: ['todo', id] });
    setShowSchedulePicker(false);
  }, [todo, id, queryClient]);

  const saveDueDate = useCallback(async () => {
    if (!todo) return;
    const dueDate = dueInput ? new Date(dueInput) : undefined;
    await updateTodo(dbStore, todo.id, { dueDate });
    hapticImpact();
    queryClient.invalidateQueries({ queryKey: ['todo', id] });
    setShowDuePicker(false);
  }, [todo, dueInput, id, queryClient]);

  const clearDueDate = useCallback(async () => {
    if (!todo) return;
    await updateTodo(dbStore, todo.id, { dueDate: undefined });
    hapticImpact();
    queryClient.invalidateQueries({ queryKey: ['todo', id] });
    setShowDuePicker(false);
  }, [todo, id, queryClient]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <Text style={{ color: '#94a3b8' }}>Loading...</Text>
      </View>
    );
  }

  if (!todo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', paddingHorizontal: 16 }}>
        <Text style={{ color: '#94a3b8' }}>Task not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: '#6366f1' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isDone = todo.status === 'done';
  const isInProgress = todo.status === 'in_progress';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
    >
      <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        {/* Header actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chevron-back" size={18} color="#94a3b8" />
            <Text style={{ fontSize: 14, color: '#64748b' }}>Back</Text>
          </Pressable>
          <Pressable onPress={handleDelete} style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#94a3b8" />
          </Pressable>
        </View>

        {/* Title */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <Pressable onPress={toggleStatus} style={{ marginTop: 4 }}>
            {isDone ? (
              <Ionicons name="checkmark-circle" size={26} color="#22c55e" />
            ) : (
              <Ionicons name="ellipse-outline" size={26} color="#cbd5e1" />
            )}
          </Pressable>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '600',
              flex: 1,
              color: isDone ? '#94a3b8' : '#0f172a',
              textDecorationLine: isDone ? 'line-through' : 'none',
            }}
          >
            {todo.title}
          </Text>
        </View>

        {/* Meta */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, marginLeft: 38 }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: todo.priority === 'high' ? '#fff1f2' : todo.priority === 'medium' ? '#fffbeb' : '#f1f5f9',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: todo.priority === 'high' ? '#f43f5e' : todo.priority === 'medium' ? '#f59e0b' : '#64748b',
              }}
            >
              {todo.priority}
            </Text>
          </View>
          {(todo.estimatedMinutes ?? 0) > 0 ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 12, color: '#64748b' }}>
                {todo.estimatedMinutes} min
              </Text>
            </View>
          ) : null}

          {/* Scheduled date */}
          {showSchedulePicker ? (
            <View style={{ width: '100%', marginTop: 8, gap: 12 }}>
              <TextInput
                value={scheduleInput}
                onChangeText={setScheduleInput}
                placeholder="YYYY-MM-DDTHH:MM"
                placeholderTextColor="#94a3b8"
                style={{ width: '100%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9', fontSize: 14, color: '#0f172a' }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={saveSchedule} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#6366f1', alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>Save</Text>
                </Pressable>
                {todo.scheduledDate ? (
                  <Pressable onPress={clearSchedule} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' }}>
                    <Ionicons name="close" size={18} color="#475569" />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setShowSchedulePicker(false)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' }}
                >
                  <Text style={{ fontSize: 14, color: '#475569' }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowSchedulePicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: todo.scheduledDate ? '#eef2ff' : '#f1f5f9',
              }}
            >
              <Ionicons name="time-outline" size={12} color={todo.scheduledDate ? '#6366f1' : '#94a3b8'} />
              <Text style={{ fontSize: 12, color: todo.scheduledDate ? '#6366f1' : '#64748b' }}>
                {todo.scheduledDate
                  ? new Date(todo.scheduledDate).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : 'Schedule'}
              </Text>
            </Pressable>
          )}

          {/* Due date */}
          {showDuePicker ? (
            <View style={{ width: '100%', marginTop: 8, gap: 12 }}>
              <TextInput
                value={dueInput}
                onChangeText={setDueInput}
                placeholder="YYYY-MM-DDTHH:MM"
                placeholderTextColor="#94a3b8"
                style={{ width: '100%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9', fontSize: 14, color: '#0f172a' }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={saveDueDate} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#6366f1', alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>Save</Text>
                </Pressable>
                {todo.dueDate ? (
                  <Pressable onPress={clearDueDate} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' }}>
                    <Ionicons name="close" size={18} color="#475569" />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setShowDuePicker(false)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' }}
                >
                  <Text style={{ fontSize: 14, color: '#475569' }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowDuePicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: todo.dueDate ? '#fffbeb' : '#f1f5f9',
              }}
            >
              <Ionicons name="calendar-outline" size={12} color={todo.dueDate ? '#f59e0b' : '#94a3b8'} />
              <Text style={{ fontSize: 12, color: todo.dueDate ? '#f59e0b' : '#64748b' }}>
                {todo.dueDate
                  ? `Due ${new Date(todo.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'Set due'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Description */}
        {todo.description ? (
          <View style={{ marginBottom: 24, marginLeft: 38 }}>
            <Text style={{ fontSize: 14, color: '#475569', lineHeight: 20 }}>
              {todo.description}
            </Text>
          </View>
        ) : null}

        {/* Status badge */}
        {!isDone && isInProgress ? (
          <View style={{ marginLeft: 38 }}>
            <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: '#fcd34d', padding: 16, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time" size={16} color="#d97706" />
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#d97706' }}>
                  In Progress
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
