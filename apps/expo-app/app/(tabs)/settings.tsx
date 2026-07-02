import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { syncAll, getSyncConfig, setSyncConfig } from '@/lib/sync';
import { resetAllData } from '@/lib/database';
import {
  getTimeSlotDefinitions,
  updateTimeSlotDefinition,
  ensureTimeSlotTodo,
  type TimeSlotDefinition,
} from '@/lib/timeSlots';
import { queryClient } from '@/lib/query-client';

const SYNC_VERSION = 'v5-safe-dates';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTimeValue(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

type SlotChanges = Partial<Omit<TimeSlotDefinition, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>>;

function TimeSlotEditorRow({
  slot,
  onCommit,
}: {
  slot: TimeSlotDefinition;
  onCommit: (slot: TimeSlotDefinition, changes: SlotChanges) => void;
}) {
  const [start, setStart] = useState(formatTimeValue(slot.startHour, slot.startMinute));
  const [end, setEnd] = useState(formatTimeValue(slot.endHour, slot.endMinute));

  useEffect(() => {
    setStart(formatTimeValue(slot.startHour, slot.startMinute));
    setEnd(formatTimeValue(slot.endHour, slot.endMinute));
  }, [slot.startHour, slot.startMinute, slot.endHour, slot.endMinute]);

  const commitStart = () => {
    const parsed = parseTimeValue(start);
    if (parsed) {
      onCommit(slot, {
        startHour: parsed.hour,
        startMinute: parsed.minute,
        time: formatTimeValue(parsed.hour, parsed.minute),
      });
    } else {
      setStart(formatTimeValue(slot.startHour, slot.startMinute));
    }
  };

  const commitEnd = () => {
    const parsed = parseTimeValue(end);
    if (parsed) {
      onCommit(slot, { endHour: parsed.hour, endMinute: parsed.minute });
    } else {
      setEnd(formatTimeValue(slot.endHour, slot.endMinute));
    }
  };

  const timeInputStyle = {
    width: 68,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    fontSize: 14,
    color: '#0f172a',
    textAlign: 'center' as const,
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: '#0f172a' }}>{slot.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={start}
          onChangeText={setStart}
          onEndEditing={commitStart}
          onBlur={commitStart}
          placeholder="06:00"
          placeholderTextColor="#94a3b8"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          style={timeInputStyle}
        />
        <Text style={{ fontSize: 14, color: '#94a3b8' }}>–</Text>
        <TextInput
          value={end}
          onChangeText={setEnd}
          onEndEditing={commitEnd}
          onBlur={commitEnd}
          placeholder="12:00"
          placeholderTextColor="#94a3b8"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          style={timeInputStyle}
        />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlotDefinition[]>([]);
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'resetting' | 'done' | 'error'>('idle');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    loadSettings();
    loadTimeSlots();
  }, []);

  const loadTimeSlots = async () => {
    setTimeSlots(await getTimeSlotDefinitions());
  };

  const handleSlotCommit = async (slot: TimeSlotDefinition, changes: SlotChanges) => {
    await updateTimeSlotDefinition(slot.id, changes);
    await ensureTimeSlotTodo({ ...slot, ...changes });
    await loadTimeSlots();
    queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  };

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
    setSyncError('');
    try {
      await syncAll();
      setSyncStatus('success');
    } catch (e: any) {
      console.error('[sync] Sync Now failed:', e?.message || e);
      setSyncStatus('error');
      setSyncError(e?.message || String(e));
    } finally {
      setSyncing(false);
      setTimeout(() => { setSyncStatus('idle'); setSyncError(''); }, 8000);
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

  const handleResetAllData = async () => {
    if (resetState === 'idle') {
      setResetState('confirm');
      return;
    }
    if (resetState !== 'confirm') return;

    setResetState('resetting');
    setResetError('');

    const config = await getSyncConfig();
    const serverUrl = config?.serverUrl;

    try {
      // Notify the server to wipe global data first (fail-safe: if this fails,
      // local data is left untouched so the user can retry).
      if (serverUrl) {
        const headers: Record<string, string> = {};
        if (config.apiToken) {
          headers['Authorization'] = `Bearer ${config.apiToken}`;
        }
        const res = await fetch(`${serverUrl}/api/all-data`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
      }

      // Stop sync, clear every local table, clear React Query cache, and recreate root goal.
      await resetAllData();

      // Reset UI state so it matches a fresh install.
      setServerUrl('');
      setApiToken('');
      setSyncStatus('idle');

      setResetState('done');
      setTimeout(() => setResetState('idle'), 3000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Reset failed');
      setResetState('error');
    }
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
              <Text style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{SYNC_VERSION}</Text>
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
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle" size={14} color="#f43f5e" />
                    <Text style={{ fontSize: 12, color: '#f43f5e' }}>Sync failed</Text>
                  </View>
                  {syncError ? (
                    <Text style={{ fontSize: 11, color: '#94a3b8', marginLeft: 20 }} numberOfLines={3}>
                      {syncError}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Daily Time Slots */}
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
          <View style={{ padding: 16, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="time-outline" size={20} color="#6366f1" />
              <Text style={{ fontSize: 15, color: '#0f172a' }}>Daily Time Slots</Text>
            </View>
            {timeSlots.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#94a3b8' }}>No time slots configured.</Text>
            ) : (
              <View style={{ gap: 14 }}>
                {timeSlots.map((slot) => (
                  <TimeSlotEditorRow key={slot.id} slot={slot} onCommit={handleSlotCommit} />
                ))}
              </View>
            )}
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
          {resetState === 'confirm' && (
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#fecdd3', backgroundColor: '#fff1f2' }}>
              <Text style={{ fontSize: 13, color: '#be123c', lineHeight: 18 }}>
                Are you sure? This will permanently delete all local data, all server data, and
                reset sync configuration. This action cannot be undone.
              </Text>
            </View>
          )}
          {resetState === 'error' && resetError ? (
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#fecdd3', backgroundColor: '#fff1f2' }}>
              <Text style={{ fontSize: 13, color: '#be123c' }}>{resetError}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={handleResetAllData}
            disabled={resetState === 'resetting'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              opacity: resetState === 'resetting' ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={
                resetState === 'done'
                  ? 'checkmark-circle-outline'
                  : resetState === 'resetting'
                  ? 'refresh'
                  : 'trash-outline'
              }
              size={20}
              color={resetState === 'done' ? '#16a34a' : '#f43f5e'}
            />
            <Text style={{ flex: 1, fontSize: 15, color: resetState === 'done' ? '#16a34a' : '#f43f5e' }}>
              {resetState === 'resetting'
                ? 'Resetting...'
                : resetState === 'done'
                ? 'Reset Complete'
                : resetState === 'confirm'
                ? 'Confirm Reset All Data'
                : 'Reset All Data'}
            </Text>
          </Pressable>
          {resetState === 'confirm' && (
            <Pressable
              onPress={() => setResetState('idle')}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#fecdd3' }}
            >
              <Text style={{ fontSize: 14, color: '#64748b' }}>Cancel</Text>
            </Pressable>
          )}
        </View>

        {/* About */}
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>Utral Todo v1.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}
