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
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { clearAllData, db } from '../db/database';
import { getSyncConfig, saveSyncConfig, validateServerUrl } from '../db/sync';
import { processQueue, start, stop } from '../db/syncEngine';

export function Settings() {
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [confirmClearServer, setConfirmClearServer] = useState(false);
  const [clearedServer, setClearedServer] = useState(false);
  const [clearServerError, setClearServerError] = useState('');
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

  useEffect(() => {
    const config = getSyncConfig();
    if (config) {
      setServerUrl(config.serverUrl);
      setApiToken(config.apiToken || '');
    } else {
      setServerUrl('http://localhost:3001');
    }

    db.syncState.get('lastSyncAt').then((state) => {
      if (state?.value) setLastSync(new Date(state.value));
    }).catch(() => {});

    const interval = setInterval(() => {
      db.syncQueue.count().then((count) => {
        setPendingCount(count);
      }).catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    await clearAllData();
    setConfirmClear(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  }

  async function handleClearServer() {
    if (!confirmClearServer) {
      setConfirmClearServer(true);
      return;
    }
    setClearServerError('');
    const config = getSyncConfig();
    if (!config?.serverUrl) {
      setClearServerError('No server URL configured. Set one in Sync & Backup first.');
      setConfirmClearServer(false);
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (config.apiToken) {
        headers['Authorization'] = `Bearer ${config.apiToken}`;
      }
      const res = await fetch(`${config.serverUrl}/api/all-data`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      setConfirmClearServer(false);
      setClearedServer(true);
      setTimeout(() => setClearedServer(false), 2000);
    } catch (err) {
      setClearServerError(err instanceof Error ? err.message : 'Failed to clear server data');
      setConfirmClearServer(false);
    }
  }

  function handleSaveSyncConfig() {
    const validation = validateServerUrl(serverUrl);
    if (!validation.valid) {
      setUrlError(validation.error || 'Invalid URL');
      return;
    }
    setUrlError('');
    saveSyncConfig({ serverUrl, apiToken: apiToken || undefined });
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
      const count = await db.syncQueue.count();
      setPendingCount(count);
      if (count === 0) {
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
    const data = {
      todos: await db.todos.toArray(),
      relations: await db.relations.toArray(),
      todoLogs: await db.todoLogs.toArray(),
      actionEdges: await db.actionEdges.toArray(),
      pluses: await db.pluses.toArray(),
      timerSessions: await db.timerSessions.toArray(),
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
      if (data.todos) await db.todos.bulkPut(data.todos);
      if (data.relations) await db.relations.bulkPut(data.relations);
      if (data.todoLogs) await db.todoLogs.bulkPut(data.todoLogs);
      if (data.actionEdges) await db.actionEdges.bulkPut(data.actionEdges);
      if (data.pluses) await db.pluses.bulkPut(data.pluses);
      if (data.timerSessions) await db.timerSessions.bulkPut(data.timerSessions);
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
    <div className="max-w-2xl">
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage your local data</p>
          </div>
        </div>

        {confirmClear && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Are you sure? This will permanently delete all todos, relations, and logs. This action cannot be undone.</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleClear}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              confirmClear
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {cleared ? 'Cleared!' : confirmClear ? 'Confirm Clear All Data' : 'Clear All Data'}
          </button>
          {confirmClear && (
            <button
              onClick={() => setConfirmClear(false)}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleClearServer}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              confirmClearServer
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {clearedServer ? 'Server Cleared!' : confirmClearServer ? 'Confirm Clear Server Data' : 'Clear Server Data'}
          </button>
          {confirmClearServer && (
            <button
              onClick={() => setConfirmClearServer(false)}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          )}
        </div>

        {clearServerError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{clearServerError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
