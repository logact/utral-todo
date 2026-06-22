import { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTodo } from '@/lib/todos';

export function QuickAdd() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => createTodo({ title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setTitle('');
      setVisible(false);
    },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate();
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        className="absolute bottom-6 right-6 bg-blue-500 w-14 h-14 rounded-full items-center justify-center shadow-lg"
      >
        <Ionicons name="add" size={28} color="white" />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade">
        <Pressable
          className="flex-1 bg-black/50 justify-center px-6"
          onPress={() => setVisible(false)}
        >
          <Pressable
            className="bg-white dark:bg-gray-800 rounded-2xl p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Quick Add
            </Text>
            <TextInput
              className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3 text-gray-900 dark:text-white mb-4"
              placeholder="What needs to be done?"
              placeholderTextColor="#9ca3af"
              value={title}
              onChangeText={setTitle}
              autoFocus
              onSubmitEditing={handleCreate}
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setVisible(false)}
                className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-lg py-3 items-center"
              >
                <Text className="text-gray-700 dark:text-gray-300 font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={!title.trim()}
                className="flex-1 bg-blue-500 rounded-lg py-3 items-center"
              >
                <Text className="text-white font-medium">Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
