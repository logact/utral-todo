import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Pluse } from '@/lib/database';

interface PluseCardProps {
  pluse: Pluse;
  onPress: () => void;
  onRun: () => void;
}

export function PluseCard({ pluse, onPress, onRun }: PluseCardProps) {
  const totalMinutes = pluse.intervals.reduce((sum, i) => sum + i, 0) * pluse.repeatCount;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-900 dark:text-white">{pluse.name}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {pluse.intervals.length} intervals
            </Text>
            <Text className="text-gray-300 dark:text-gray-600">·</Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {totalMinutes}m total
            </Text>
            <Text className="text-gray-300 dark:text-gray-600">·</Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {pluse.repeatCount}x
            </Text>
          </View>
          <View className="flex-row gap-1 mt-2">
            {pluse.intervals.map((min, i) => (
              <View key={i} className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                <Text className="text-xs text-blue-600 dark:text-blue-400">{min}m</Text>
              </View>
            ))}
          </View>
        </View>
        <Pressable onPress={onRun} className="bg-green-500 p-3 rounded-full ml-3">
          <Ionicons name="play" size={20} color="white" />
        </Pressable>
      </View>
    </Pressable>
  );
}
