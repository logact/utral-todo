import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getInProgressTodos } from '@/lib/todos';

export function FocusSessionCard() {
  const router = useRouter();

  const { data: inProgress = [] } = useQuery({
    queryKey: ['todos', 'inProgress'],
    queryFn: getInProgressTodos,
  });

  if (inProgress.length === 0) return null;

  return (
    <View className="px-4 mb-4">
      <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="play-circle" size={20} color="#3b82f6" />
          <Text className="text-blue-700 dark:text-blue-300 font-semibold">Active Session</Text>
        </View>
        {inProgress.slice(0, 1).map((todo: any) => (
          <Pressable
            key={todo.id}
            onPress={() => router.push(`/todo/${todo.id}`)}
          >
            <Text className="text-gray-900 dark:text-white font-medium">{todo.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
