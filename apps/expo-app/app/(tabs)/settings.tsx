import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { syncAll, getSyncConfig, setSyncConfig } from '@/lib/sync';
import { clearAllData } from '@/lib/database';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const config = await getSyncConfig();
    if (config) {
      setServerUrl(config.serverUrl || '');
      setApiToken(config.apiToken || '');
    }
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationsEnabled(status === 'granted');
  };

  const handleSaveSync = async () => {
    const url = serverUrl.trim();
    if (!url) {
      await setSyncConfig({ serverUrl: '', apiToken: '' });
    } else {
      await setSyncConfig({ serverUrl: url, apiToken: apiToken.trim() || undefined });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus('idle');
    try {
      await syncAll();
      setSyncStatus('success');
    } catch (e: any) {
      setSyncStatus('error');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
    } else {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
    }
  };

  const handleClearData = () => {
    Alert.alert('Clear All Data', 'This will permanently delete all local data. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAllData();
          Alert.alert('Done', 'All data has been cleared');
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
    >
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {/* Notifications */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
          <Pressable
            onPress={handleToggleNotifications}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Ionicons name="notifications-outline" size={20} color="#6366f1" />
            <Text style={{ flex: 1, fontSize: 15, color: '#0f172a' }}>
              Push Notifications
            </Text>
            <View
              style={{
                width: 48,
                height: 28,
                borderRadius: 14,
                padding: 2,
                backgroundColor: notificationsEnabled ? '#6366f1' : '#e2e8f0',
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: 'white',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                  elevation: 2,
                  marginLeft: notificationsEnabled ? 20 : 0,
                }}
              />
            </View>
          </Pressable>
        </View>

        {/* Sync */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
          <View style={{ padding: 16, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="sync-outline" size={20} color="#6366f1" />
              <Text style={{ fontSize: 15, color: '#0f172a' }}>Sync</Text>
            </View>

            <View style={{ gap: 12 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b', marginBottom: 4 }}>
                  Server URL
                </Text>
                <TextInput
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  placeholder="http://localhost:3001"
                  placeholderTextColor="#94a3b8"
                  style={{
                    width: '100%',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: '#f1f5f9',
                    fontSize: 14,
                    color: '#0f172a',
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b', marginBottom: 4 }}>
                  API Token
                </Text>
                <TextInput
                  value={apiToken}
                  onChangeText={setApiToken}
                  placeholder="Optional"
                  placeholderTextColor="#94a3b8"
                  style={{
                    width: '100%',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: '#f1f5f9',
                    fontSize: 14,
                    color: '#0f172a',
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={handleSaveSync}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6366f1', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '500', color: 'white' }}>Save</Text>
                </Pressable>
                {serverUrl ? (
                  <Pressable
                    onPress={handleSync}
                    disabled={syncing}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', opacity: syncing ? 0.5 : 1 }}
                  >
                    <Ionicons name="sync" size={14} color="#475569" />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#475569' }}>
                      {syncing ? 'Syncing...' : 'Sync Now'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {syncStatus === 'success' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={{ fontSize: 12, color: '#16a34a' }}>Sync complete</Text>
                </View>
              ) : null}
              {syncStatus === 'error' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="alert-circle" size={14} color="#f43f5e" />
                  <Text style={{ fontSize: 12, color: '#f43f5e' }}>Sync failed</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Device Info */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Ionicons name="phone-portrait-outline" size={20} color="#94a3b8" />
            <Text style={{ fontSize: 15, color: '#0f172a' }}>Device</Text>
          </View>
          <View style={{ marginLeft: 32, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: '#64748b' }}>Device</Text>
              <Text style={{ fontSize: 14, color: '#0f172a' }}>
                {Device.deviceName || 'Unknown'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: '#64748b' }}>Platform</Text>
              <Text style={{ fontSize: 14, color: '#0f172a' }}>
                {Device.osName} {Device.osVersion}
              </Text>
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#fecdd3', overflow: 'hidden' }}>
          <Pressable onPress={handleClearData} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
            <Ionicons name="trash-outline" size={20} color="#f43f5e" />
            <Text style={{ flex: 1, fontSize: 15, color: '#f43f5e' }}>Clear All Data</Text>
          </Pressable>
        </View>

        {/* About */}
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>Utral Todo v1.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}
