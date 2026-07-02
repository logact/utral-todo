import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '../src/db';
import { initDatabase } from '../src/lib/database';
import { startSync, stopSync } from '../src/lib/sync';
import { queryClient } from '../src/lib/query-client';
import migrations from '../drizzle/migrations';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (!success) return;

    let cancelled = false;
    initDatabase()
      .then(() => {
        if (!cancelled) {
          startSync();
        }
      })
      .catch((err) => console.error('[seed] init failed:', err));

    return () => {
      cancelled = true;
      stopSync();
    };
  }, [success]);

  if (error) {
    console.error('[migrations] failed:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>数据库初始化失败：{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>正在初始化数据库…</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="todo/[id]"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="pluse/[id]"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="pluse-run/[id]"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
