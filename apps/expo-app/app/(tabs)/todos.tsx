import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllTodos, updateTodoStatus, deleteTodo } from '@utral/db-schema/todo-ops';
import { hapticImpact } from '@/lib/native';
import { dbStore } from '@/lib/db-store';
import { useDbChangeRefresh } from '@/hooks/useDbChangeRefresh';
import type { Todo, TodoStatus } from '@utral/types';

type FilterStatus = TodoStatus | 'all';

export default function TodosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');

  const refreshTodos = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  }, [queryClient]);
  useDbChangeRefresh(refreshTodos, { tables: ['todos'] });

  const { data: todos = [] } = useQuery({
    queryKey: ['todos'],
    queryFn: () => getAllTodos(dbStore),
  });

  const toggleStatus = useCallback(
    async (todo: Todo) => {
      const newStatus: TodoStatus = todo.status === 'done' ? 'pending' : 'done';
      await updateTodoStatus(dbStore, todo.id, newStatus);
      hapticImpact();
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    [queryClient]
  );

  const handleDelete = useCallback(
    (todo: Todo) => {
      Alert.alert('Delete', `Delete "${todo.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTodo(dbStore, todo.id);
            hapticImpact();
            queryClient.invalidateQueries({ queryKey: ['todos'] });
          },
        },
      ]);
    },
    [queryClient]
  );

  const query = searchQuery.trim().toLowerCase();
  const filtered = todos.filter((t) => {
    if (t.pattern === 'timeSlot') return false;
    const matchesFilter = filter === 'all' || t.status === filter;
    const matchesSearch =
      !query ||
      t.title.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'done', label: 'Done' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 8 }}>
        {/* Search */}
        <View style={{ position: 'relative', marginBottom: 12 }}>
          <Ionicons
            name="search"
            size={16}
            color="#94a3b8"
            style={{ position: 'absolute', left: 12, top: 10 }}
          />
          <TextInput
            style={{
              width: '100%',
              paddingLeft: 36,
              paddingRight: 32,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: '#f1f5f9',
              fontSize: 14,
              color: '#0f172a',
            }}
            placeholder="Search tasks..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 8, top: 10 }}
            >
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>

        {/* Filter tabs */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {filters.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: filter === f.key ? '#6366f1' : '#f1f5f9',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '500',
                  color: filter === f.key ? 'white' : '#475569',
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        renderItem={({ item }: { item: Todo }) => (
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
            <Pressable onPress={() => toggleStatus(item)} style={{ marginTop: 2, marginRight: 12 }}>
              {item.status === 'done' ? (
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color="#cbd5e1" />
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push(`/todo/${item.id}`)}
              onLongPress={() => handleDelete(item)}
              style={{ flex: 1 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '500',
                  color: item.status === 'done' ? '#94a3b8' : '#0f172a',
                  textDecorationLine: item.status === 'done' ? 'line-through' : 'none',
                }}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 80 }}>
            <Text style={{ fontSize: 14, color: '#94a3b8' }}>No tasks</Text>
          </View>
        }
      />
    </View>
  );
}
