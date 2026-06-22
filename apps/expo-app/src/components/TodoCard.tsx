import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Todo } from '@/lib/database';

interface TodoCardProps {
  todo: Todo;
  onPress: () => void;
}

export function TodoCard({ todo, onPress }: TodoCardProps) {
  const statusIcon = {
    pending: 'ellipse-outline' as const,
    in_progress: 'time' as const,
    done: 'checkmark-circle' as const,
  };

  const statusColor = {
    pending: '#9ca3af',
    in_progress: '#3b82f6',
    done: '#22c55e',
  };

  const priorityBg = {
    low: 'bg-gray-100 dark:bg-gray-800',
    medium: 'bg-orange-50 dark:bg-orange-900/20',
    high: 'bg-red-50 dark:bg-red-900/20',
  };

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl p-4 mb-2 ${priorityBg[todo.priority || 'medium']}`}
    >
      <View className="flex-row items-center gap-3">
        <Ionicons
          name={statusIcon[todo.status || 'pending']}
          size={22}
          color={statusColor[todo.status || 'pending']}
        />
        <View className="flex-1">
          <Text
            className={`text-base font-medium ${
              todo.status === 'done'
                ? 'text-gray-400 line-through'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {todo.title}
          </Text>
          <View className="flex-row gap-2 mt-1">
            {todo.estimatedMinutes ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {todo.estimatedMinutes}m
              </Text>
            ) : null}
            {todo.dueDate ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Due {new Date(todo.dueDate).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
      </View>
    </Pressable>
  );
}
