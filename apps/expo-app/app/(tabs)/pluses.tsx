import { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllPluses, createPluse, deletePluse, updatePluse } from '@utral/db-schema/pluse-ops';
import { hapticImpact } from '@/lib/native';
import { dbStore } from '@/lib/db-store';
import { useDbChangeRefresh } from '@/hooks/useDbChangeRefresh';
import type { Pluse } from '@utral/types';

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function calcTotalSeconds(intervals: number[], repeatCount: number): number {
  return intervals.reduce((s, d) => s + d, 0) * repeatCount;
}

function PluseEditor({
  initialPluse,
  onSave,
  onCancel,
}: {
  initialPluse?: Pluse;
  onSave: (data: { name: string; intervals: number[]; repeatCount: number; autoAdvance: boolean }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialPluse?.name ?? '');
  const [intervals, setIntervals] = useState<number[]>(initialPluse?.intervals ?? [1500]);
  const [repeatCount, setRepeatCount] = useState(String(initialPluse?.repeatCount ?? 1));
  const [autoAdvance, setAutoAdvance] = useState(initialPluse?.autoAdvance ?? true);

  function updateIntervalMinutes(index: number, minutes: number) {
    const next = [...intervals];
    const secs = intervals[index] % 60;
    next[index] = Math.max(1, minutes * 60 + secs);
    setIntervals(next);
  }

  function updateIntervalSeconds(index: number, seconds: number) {
    const next = [...intervals];
    const mins = Math.floor(intervals[index] / 60);
    next[index] = Math.max(1, mins * 60 + seconds);
    setIntervals(next);
  }

  function addInterval() {
    setIntervals([...intervals, 1500]);
  }

  function removeInterval(index: number) {
    if (intervals.length <= 1) return;
    setIntervals(intervals.filter((_, i) => i !== index));
  }

  const isValid = name.trim() && intervals.length > 0;

  return (
    <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Pluse name..."
        placeholderTextColor="#94a3b8"
        style={{ fontSize: 16, fontWeight: '500', color: '#0f172a', marginBottom: 16 }}
        autoFocus
      />

      <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b', marginBottom: 8 }}>Intervals</Text>
      <View style={{ gap: 8, marginBottom: 12 }}>
        {intervals.map((duration, idx) => {
          const minutes = Math.floor(duration / 60);
          const seconds = duration % 60;
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: '#94a3b8', width: 64 }}>Interval {idx + 1}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <TextInput
                  keyboardType="numeric"
                  value={String(minutes)}
                  onChangeText={(v) => updateIntervalMinutes(idx, parseInt(v) || 0)}
                  style={{ width: 40, fontSize: 12, color: '#0f172a', textAlign: 'center' }}
                />
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>min</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <TextInput
                  keyboardType="numeric"
                  value={String(seconds)}
                  onChangeText={(v) => updateIntervalSeconds(idx, parseInt(v) || 0)}
                  style={{ width: 40, fontSize: 12, color: '#0f172a', textAlign: 'center' }}
                />
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>sec</Text>
              </View>
              <Pressable
                onPress={() => removeInterval(idx)}
                disabled={intervals.length <= 1}
                style={{ padding: 4, opacity: intervals.length <= 1 ? 0.3 : 1 }}
              >
                <Ionicons name="close-circle" size={16} color="#f43f5e" />
              </Pressable>
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={addInterval}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', alignSelf: 'flex-start', marginBottom: 12 }}
      >
        <Ionicons name="add" size={12} color="#64748b" />
        <Text style={{ fontSize: 10, fontWeight: '500', color: '#475569' }}>Add interval</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>Repeat</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Text style={{ fontSize: 10, color: '#94a3b8' }}>×</Text>
            <TextInput
              keyboardType="numeric"
              value={repeatCount}
              onChangeText={setRepeatCount}
              style={{ width: 32, fontSize: 12, color: '#0f172a', textAlign: 'center' }}
            />
          </View>
        </View>
        <Text style={{ fontSize: 10, color: '#94a3b8' }}>
          {formatSeconds(calcTotalSeconds(intervals, parseInt(repeatCount) || 1))} total
        </Text>
      </View>

      <Pressable
        onPress={() => setAutoAdvance(!autoAdvance)}
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          borderWidth: 1,
          backgroundColor: autoAdvance ? '#ecfdf5' : 'white',
          borderColor: autoAdvance ? '#a7f3d0' : '#e2e8f0',
          marginBottom: 12,
        }}
      >
        <Ionicons name="flash" size={12} color={autoAdvance ? '#22c55e' : '#94a3b8'} />
        <Text style={{ fontSize: 12, fontWeight: '500', color: autoAdvance ? '#16a34a' : '#64748b' }}>
          {autoAdvance ? 'Auto advance on' : 'Auto advance off'}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
        <Pressable
          onPress={() => onSave({ name: name.trim(), intervals, repeatCount: parseInt(repeatCount) || 1, autoAdvance })}
          disabled={!isValid}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6366f1', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, opacity: isValid ? 1 : 0.5 }}
        >
          <Ionicons name="checkmark" size={14} color="white" />
          <Text style={{ fontSize: 12, fontWeight: '500', color: 'white' }}>
            {initialPluse ? 'Save' : 'Create'}
          </Text>
        </Pressable>
        <Pressable onPress={onCancel} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, color: '#64748b' }}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PluseCardItem({
  pluse,
  onDelete,
  onEdit,
}: {
  pluse: Pluse;
  onDelete: (id: string) => void;
  onEdit: (pluse: Pluse) => void;
}) {
  const totalSeconds = calcTotalSeconds(pluse.intervals, pluse.repeatCount);
  const intervalCount = pluse.intervals.length * pluse.repeatCount;

  return (
    <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }}>{pluse.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="timer-outline" size={12} color="#94a3b8" />
              <Text style={{ fontSize: 12, color: '#64748b' }}>
                {formatSeconds(totalSeconds)}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: '#64748b' }}>{intervalCount} intervals</Text>
            {pluse.repeatCount > 1 ? (
              <Text style={{ fontSize: 12, color: '#64748b' }}>×{pluse.repeatCount}</Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {pluse.intervals.map((dur, idx) => (
              <View
                key={idx}
                style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' }}
              >
                <Text style={{ fontSize: 10, fontWeight: '500', color: '#475569' }}>
                  {formatSeconds(dur)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable onPress={() => onEdit(pluse)} style={{ padding: 6 }}>
            <Ionicons name="pencil" size={16} color="#94a3b8" />
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert('Delete', 'Delete this pluse?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(pluse.id) },
              ]);
            }}
            style={{ padding: 6 }}
          >
            <Ionicons name="trash-outline" size={16} color="#94a3b8" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function PlusesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refreshPluses = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pluses'] });
  }, [queryClient]);
  useDbChangeRefresh(refreshPluses, { tables: ['pluses'] });

  const { data: pluses = [] } = useQuery({
    queryKey: ['pluses'],
    queryFn: () => getAllPluses(dbStore),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; intervals: number[]; repeatCount: number; autoAdvance: boolean }) =>
      createPluse(dbStore, data.name, data.intervals, data.repeatCount, undefined, undefined, data.autoAdvance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
      setIsCreating(false);
      hapticImpact();
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Pluse> }) =>
      updatePluse(dbStore, data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
      setEditingId(null);
      hapticImpact();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePluse(dbStore, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
      hapticImpact();
    },
  });

  const editingPluse = editingId ? pluses.find((p) => p.id === editingId) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <FlatList
        data={pluses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 96 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            {!isCreating && !editingId ? (
              <Pressable
                onPress={() => setIsCreating(true)}
                style={{
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: 'white',
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <Ionicons name="add" size={16} color="#94a3b8" />
                <Text style={{ fontSize: 14, color: '#64748b' }}>Create a new pluse</Text>
              </Pressable>
            ) : (
              <PluseEditor
                initialPluse={editingPluse}
                onSave={(data) => {
                  if (editingId) {
                    editMutation.mutate({ id: editingId, updates: data });
                  } else {
                    createMutation.mutate(data);
                  }
                }}
                onCancel={() => {
                  setIsCreating(false);
                  setEditingId(null);
                }}
              />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <PluseCardItem
            pluse={item}
            onDelete={(id) => deleteMutation.mutate(id)}
            onEdit={(p) => setEditingId(p.id)}
          />
        )}
        ListEmptyComponent={
          !isCreating && !editingId ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="timer-outline" size={28} color="#94a3b8" />
              </View>
              <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '500', color: '#0f172a' }}>No pluses yet</Text>
              <Text style={{ marginTop: 4, fontSize: 14, color: '#64748b' }}>
                Create your first pluse to start a focused work session.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
