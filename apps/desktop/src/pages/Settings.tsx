import { useState, useEffect } from 'react';
import {
  Moon,
  Sun,
  Trash2,
  AlertTriangle,
  Cloud,
  AlertCircle,
  Loader2,
  Download,
  Upload,
  Wifi,
  WifiOff,
  Zap,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { resetAllData } from '../db/database';
import { db } from '../db/drizzle-adapter';
import { todos, todoRelations, todoLogs, actionEdges, pluses } from '../db/schema';
import { getSyncConfig, saveSyncConfig, getLastSyncAt, validateServerUrl } from '../db/sync';
import { processQueue, start, stop, getSyncStatus } from '../lib/sync/syncEngine';
import {
  getTimeSlotDefinitions,
  updateTimeSlotDefinition,
} from '../db/timeSlotDefinitions';
import { ensureTimeSlotTodo } from '../db/timeSlots';
import type { TimeSlotConfig } from '../types';

function formatTimeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function TimeSlotEditor({
  slot,
  onChange,
}: {
  slot: TimeSlotConfig;
  onChange: (changes: Partial<Omit<TimeSlotConfig, 'id' | 'milestoneId' | 'title'>>) => void;
}) {
  const start = formatTimeValue(slot.startHour, slot.startMinute);
  const end = formatTimeValue(slot.endHour, slot.endMinute);

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{slot.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{slot.time}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          defaultValue={start}
          onBlur={(e) => {
            const parsed = parseTimeValue(e.target.value);
            if (parsed) {
              onChange({
                startHour: parsed.hour,
                startMinute: parsed.minute,
                time: e.target.value,
              });
            }
          }}
          className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <span className="text-slate-400">-</span>
        <input
          type="time"
          defaultValue={end}
          onBlur={(e) => {
            const parsed = parseTimeValue(e.target.value);
            if (parsed) {
              onChange({
                endHour: parsed.hour,
                endMinute: parsed.minute,
              });
            }
          }}
          className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
    </div>
  );
}

export function Settings() {
  const [saved, setSaved] = useState(false);
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'resetting' | 'done' | 'error'>('idle');
  const [resetError, setResetError] = useState('');
  const { theme, toggleTheme } = useTheme();

  // Sync & Backup state
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [syncSaved, setSyncSaved] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);
  const [error, setError] = useState('');
  const [urlError, setUrlError] = useState('');
  const [timeSlots, setTimeSlots] = useState<TimeSlotConfig[]>([]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const config = await getSyncConfig();
      if (config) {
        setServerUrl(config.serverUrl);
        setApiToken(config.apiToken || '');
      } else {
        setServerUrl('http://localhost:3001');
      }

      const lastSyncAt = await getLastSyncAt();
      if (lastSyncAt) setLastSync(lastSyncAt);

      try {
        const definitions = await getTimeSlotDefinitions();
        setTimeSlots(definitions);
      } catch (err) {
        console.error('[Settings] Failed to load time slot definitions:', err);
      }

      interval = setInterval(() => {
        try {
          const status = getSyncStatus();
          setPendingCount(status.pendingCount);
        } catch {
          // sync engine not started yet
        }
      }, 2000);
    })();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleResetAllData() {
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

      // Stop sync, clear every local table, wipe cached config, and recreate root goal.
      await resetAllData();

      // Reset UI state so it matches a fresh install.
      setServerUrl('http://localhost:3001');
      setApiToken('');
      setLastSync(undefined);
      setPendingCount(0);
      setSyncStatus('idle');

      setResetState('done');
      setTimeout(() => setResetState('idle'), 3000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Reset failed');
      setResetState('error');
    }
  }

  async function handleSaveSyncConfig() {
    const validation = validateServerUrl(serverUrl);
    if (!validation.valid) {
      setUrlError(validation.error || 'Invalid URL');
      return;
    }
    setUrlError('');
    await saveSyncConfig({ serverUrl, apiToken: apiToken || undefined });
    stop();
    start().catch((err) => {
      console.error('[Settings] Failed to start sync:', err);
    });
    setSyncSaved(true);
    setTimeout(() => setSyncSaved(false), 2000);
  }

  async function handleForceSync() {
    setSyncStatus('syncing');
    setError('');
    try {
      await processQueue();
      const status = getSyncStatus();
      setPendingCount(status.pendingCount);
      if (status.pendingCount === 0) {
        setSyncStatus('idle');
        setLastSync(new Date());
      } else {
        setSyncStatus('offline');
        setError('Some changes could not be synced. Check your connection.');
      }
    } catch (err) {
      setSyncStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExport() {
    const allTodos = await db.select().from(todos);
    const allRelations = await db.select().from(todoRelations);
    const allLogs = await db.select().from(todoLogs);
    const allEdges = await db.select().from(actionEdges);
    const allPluses = await db.select().from(pluses);
    const data = {
      todos: allTodos,
      relations: allRelations,
      todoLogs: allLogs,
      actionEdges: allEdges,
      pluses: allPluses,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utral-todo-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.todos) await db.insert(todos).values(data.todos).onConflictDoUpdate({ target: todos.id, set: { title: todos.title } });
      if (data.relations) await db.insert(todoRelations).values(data.relations).onConflictDoUpdate({ target: todoRelations.id, set: { type: todoRelations.type } });
      if (data.todoLogs) await db.insert(todoLogs).values(data.todoLogs).onConflictDoUpdate({ target: todoLogs.id, set: { content: todoLogs.content } });
      if (data.actionEdges) await db.insert(actionEdges).values(data.actionEdges).onConflictDoUpdate({ target: actionEdges.id, set: { type: actionEdges.type } });
      if (data.pluses) await db.insert(pluses).values(data.pluses).onConflictDoUpdate({ target: pluses.id, set: { name: pluses.name } });
      setError('');
      alert('Import successful');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
    e.target.value = '';
  }

  const statusConfig = {
    idle: { icon: Wifi, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', label: 'Connected' },
    syncing: { icon: Loader2, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', label: 'Syncing...' },
    offline: { icon: WifiOff, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'Offline' },
    error: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', label: 'Error' },
  };

  const currentStatus = statusConfig[syncStatus];
  const StatusIcon = currentStatus.icon;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">Configure your app preferences</p>

      {/* Theme */}
      <div className="mt-8 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
            {theme === 'dark' ? (
              <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Sun className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            )}
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Appearance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose your preferred theme</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => theme === 'dark' && toggleTheme()}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              theme === 'light'
                ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Sun className="w-4 h-4" />
            Light
          </button>
          <button
            onClick={() => theme === 'light' && toggleTheme()}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              theme === 'dark'
                ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Moon className="w-4 h-4" />
            Dark
          </button>
        </div>

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Daily Time Slots */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
            <Clock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Daily Time Slots</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Customize when each part of your day starts and ends</p>
          </div>
        </div>

        <div className="space-y-3">
          {timeSlots.map((slot) => (
            <TimeSlotEditor
              key={slot.id}
              slot={slot}
              onChange={async (changes) => {
                try {
                  await updateTimeSlotDefinition(slot.id, changes);
                  const updated = await getTimeSlotDefinitions();
                  setTimeSlots(updated);
                  const changed = updated.find((s) => s.id === slot.id);
                  if (changed) {
                    await ensureTimeSlotTodo(changed);
                  }
                } catch (err) {
                  console.error('[Settings] Failed to update time slot:', err);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Sync - Server Configuration */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Sync & Backup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Sync with remote server</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Server URL
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setUrlError('');
              }}
              placeholder="http://localhost:3001"
              className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 ${
                urlError
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-slate-200 dark:border-slate-600 focus:ring-indigo-500'
              }`}
            />
            {urlError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{urlError}</p>
            )}
            {!urlError && serverUrl && !serverUrl.startsWith('http://') && !serverUrl.startsWith('https://') && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Will auto-add http:// prefix
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              API Token (optional)
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Bearer token for authentication"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={handleSaveSyncConfig}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          {syncSaved ? 'Saved!' : 'Save Configuration'}
        </button>
      </div>

      {/* Sync - Status */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className={`w-9 h-9 rounded-lg ${currentStatus.bg} flex items-center justify-center`}>
            <StatusIcon className={`w-5 h-5 ${currentStatus.color} ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Sync Status</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lastSync
                ? `Last synced: ${lastSync.toLocaleString()}`
                : 'Never synced'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Status</span>
            <span className={`text-sm font-medium ${currentStatus.color}`}>{currentStatus.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Pending changes</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{pendingCount}</span>
          </div>
        </div>

        <button
          onClick={handleForceSync}
          disabled={syncStatus === 'syncing'}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncStatus === 'syncing' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Force Sync Now
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Sync - Backup */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
            <Download className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Local Backup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Export or import your data</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
          <label className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Import JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* Data Management */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Data Management</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Reset all data everywhere</p>
          </div>
        </div>

        {resetState === 'confirm' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Are you sure? This will permanently delete all local data, all server data, and reset
              sync configuration. This action cannot be undone.
            </p>
          </div>
        )}

        {resetState === 'error' && resetError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{resetError}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetAllData}
            disabled={resetState === 'resetting'}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              resetState === 'confirm'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : resetState === 'done'
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
            }`}
          >
            {resetState === 'resetting' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Resetting...
              </>
            ) : resetState === 'done' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Reset Complete
              </>
            ) : resetState === 'confirm' ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                Confirm Reset All Data
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Reset All Data
              </>
            )}
          </button>
          {resetState === 'confirm' && (
            <button
              onClick={() => setResetState('idle')}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
