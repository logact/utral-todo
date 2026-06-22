import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPluse, updatePluse, deletePluse } from '@/lib/pluse';
import { hapticImpact } from '@/lib/native';
import type { Pluse } from '@/lib/database';

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function calcTotalSeconds(intervals: number[], repeatCount: number): number {
  return intervals.reduce((s, d) => s + d, 0) * repeatCount;
}

export default function PluseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: pluse, isLoading } = useQuery({
    queryKey: ['pluse', id],
    queryFn: () => getPluse(id!),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [intervals, setIntervals] = useState<number[]>([]);
  const [repeatCount, setRepeatCount] = useState('1');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (pluse && !initialized) {
      setName(pluse.name);
      setIntervals([...pluse.intervals]);
      setRepeatCount(String(pluse.repeatCount));
      setAutoAdvance(pluse.autoAdvance);
      setInitialized(true);
    }
  }, [pluse, initialized]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Pluse>) => updatePluse(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
      queryClient.invalidateQueries({ queryKey: ['pluse', id] });
      hapticImpact();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePluse(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pluses'] });
      hapticImpact();
      router.back();
    },
  });

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

  const handleSave = () => {
    if (!name.trim()) return;
    updateMutation.mutate({
      name: name.trim(),
      intervals,
      repeatCount: parseInt(repeatCount) || 1,
      autoAdvance,
    });
  };

  const handleDelete = () => {
    Alert.alert('Delete', 'Delete this pluse?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  if (isLoading || !pluse) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <Text style={{ color: '#94a3b8' }}>{isLoading ? 'Loading...' : 'Pluse not found'}</Text>
      </View>
    );
  }

  const totalSeconds = calcTotalSeconds(intervals, parseInt(repeatCount) || 1);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
    >
      <View style={{ paddingHorizontal: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chevron-back" size={18} color="#94a3b8" />
            <Text style={{ fontSize: 14, color: '#64748b' }}>Back</Text>
          </Pressable>
          <Pressable onPress={handleDelete} style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#f43f5e" />
          </Pressable>
        </View>

        {/* Editor */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, gap: 16 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pluse name..."
            placeholderTextColor="#94a3b8"
            style={{ fontSize: 16, fontWeight: '500', color: '#0f172a' }}
          />

          <View>
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b', marginBottom: 8 }}>Intervals</Text>
            <View style={{ gap: 8 }}>
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
          </View>

          <Pressable onPress={addInterval} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
            <Ionicons name="add-circle-outline" size={14} color="#6366f1" />
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#6366f1' }}>Add interval</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
              {formatSeconds(totalSeconds)} total
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
            }}
          >
            <Ionicons name="flash" size={12} color={autoAdvance ? '#22c55e' : '#94a3b8'} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: autoAdvance ? '#16a34a' : '#64748b' }}>
              {autoAdvance ? 'Auto advance on' : 'Auto advance off'}
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
            <Pressable
              onPress={handleSave}
              disabled={!name.trim()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6366f1', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, opacity: name.trim() ? 1 : 0.5 }}
            >
              <Ionicons name="checkmark" size={14} color="white" />
              <Text style={{ fontSize: 12, fontWeight: '500', color: 'white' }}>Save</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: '#64748b' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>

        {/* Run button */}
        <Pressable
          onPress={() => router.push(`/pluse-run/${pluse.id}`)}
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 12 }}
        >
          <Ionicons name="play" size={18} color="white" />
          <Text style={{ color: 'white', fontWeight: '500', fontSize: 14 }}>Run Pluse</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
