import { useState, useEffect } from 'react';
import { Cloud, CheckCircle, AlertCircle, Loader2, Download, Upload } from 'lucide-react';
import { syncAll, getSyncConfig, saveSyncConfig, getLastSyncAt, validateServerUrl, type SyncResult } from '../db/sync';
import { db } from '../db/database';

export function SyncSettings() {
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [remoteOpsEnabled, setRemoteOpsEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);
  const [lastResult, setLastResult] = useState<SyncResult | undefined>(undefined);
  const [error, setError] = useState('');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    const config = getSyncConfig();
    if (config) {
      setServerUrl(config.serverUrl);
      setApiToken(config.apiToken || '');
      setRemoteOpsEnabled(config.remoteOpsEnabled ?? false);
    } else {
      setServerUrl('http://localhost:3001');
    }
    setLastSync(getLastSyncAt());
  }, []);

  function handleSave() {
    const validation = validateServerUrl(serverUrl);
    if (!validation.valid) {
      setUrlError(validation.error || 'Invalid URL');
      return;
    }
    setUrlError('');
    saveSyncConfig({ serverUrl, apiToken: apiToken || undefined, remoteOpsEnabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSync() {
    const validation = validateServerUrl(serverUrl);
    if (!validation.valid) {
      setError(validation.error || 'Please configure a valid server URL');
      return;
    }
    setError('');
    setSyncing(true);
    setLastResult(undefined);

    try {
      const result = await syncAll({ serverUrl, apiToken: apiToken || undefined, remoteOpsEnabled });
      setLastResult(result);
      if (!result.success) {
        setError(result.error || 'Sync failed');
      } else {
        setLastSync(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    const data = {
      todos: await db.todos.toArray(),
      projects: await db.projects.toArray(),
      relations: await db.relations.toArray(),
      todoLogs: await db.todoLogs.toArray(),
      roadmaps: await db.roadmaps.toArray(),
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
      if (data.projects) await db.projects.bulkPut(data.projects);
      if (data.relations) await db.relations.bulkPut(data.relations);
      if (data.todoLogs) await db.todoLogs.bulkPut(data.todoLogs);
      if (data.roadmaps) await db.roadmaps.bulkPut(data.roadmaps);
      if (data.actionEdges) await db.actionEdges.bulkPut(data.actionEdges);
      if (data.pluses) await db.pluses.bulkPut(data.pluses);
      if (data.timerSessions) await db.timerSessions.bulkPut(data.timerSessions);
      setLastResult(undefined);
      setError('');
      alert('Import successful');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
    e.target.value = '';
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Sync & Backup</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">Sync with remote server or manage backups</p>

      {/* Server Configuration */}
      <div className="mt-8 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
            <Cloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Remote Server</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure your sync endpoint</p>
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remoteOpsEnabled}
              onChange={(e) => setRemoteOpsEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Send todo changes to server automatically
            </span>
          </label>
        </div>

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </div>

      {/* Sync Action */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            {syncing ? (
              <Loader2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-spin" />
            ) : (
              <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Sync</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lastSync
                ? `Last synced: ${lastSync.toLocaleString()}`
                : 'Never synced'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing || !serverUrl}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4" />
              Sync Now
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {lastResult?.success && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Sync completed successfully</p>
              <p className="mt-1 text-xs">
                Pulled: {lastResult.pulled.todos} todos, {lastResult.pulled.projects} projects,{' '}
                {lastResult.pulled.relations} relations
              </p>
              <p className="text-xs">
                Pushed: {lastResult.pushed.todos} todos, {lastResult.pushed.projects} projects,{' '}
                {lastResult.pushed.relations} relations
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Backup */}
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
    </div>
  );
}
