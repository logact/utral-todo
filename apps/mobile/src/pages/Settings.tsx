import { useState, useEffect } from 'react';
import { Moon, Sun, Smartphone, Server, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { nativeDevice, nativeNotification, isNativeShell } from '../bridge/native';
import { getSyncConfig, setSyncConfig, syncAll } from '../db/sync';
import * as syncEngine from '../db/syncEngine';

export function SettingsPage() {
  const [deviceInfo, setDeviceInfo] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (isNativeShell()) {
      nativeDevice.getInfo().then((info) => {
        setDeviceInfo(`${info.model} · iOS ${info.systemVersion}`);
      }).catch(() => {});
    }
    const config = getSyncConfig();
    if (config) {
      setServerUrl(config.serverUrl);
      setApiToken(config.apiToken ?? '');
    }
    // Poll connection status
    const interval = setInterval(() => {
      setIsConnected(syncEngine.getSyncStatus().connected);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  function toggleTheme() {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', newTheme);
  }

  async function requestNotifications() {
    if (isNativeShell()) {
      const granted = await nativeNotification.requestPermission();
      alert(granted ? 'Notifications enabled' : 'Notifications denied');
    } else {
      alert('Native bridge not available');
    }
  }

  function saveSyncConfig() {
    const url = serverUrl.trim();
    if (!url) {
      setSyncConfig(null);
      syncEngine.stop();
      setIsConnected(false);
      return;
    }
    setSyncConfig({
      serverUrl: url,
      apiToken: apiToken.trim() || undefined,
    });
    syncEngine.stop();
    syncEngine.start().catch(() => {});
  }

  async function handleSyncNow() {
    setSyncStatus('syncing');
    setSyncError('');
    try {
      const result = await syncAll();
      if (result.success) {
        setSyncStatus('success');
      } else {
        setSyncStatus('error');
        setSyncError(result.error || 'Sync failed');
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof Error ? err.message : String(err));
    }
    setTimeout(() => setSyncStatus('idle'), 3000);
  }

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Appearance */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 dark:active:bg-slate-800/50"
        >
          {theme === 'dark' ? (
            <Moon className="w-5 h-5 text-indigo-500" />
          ) : (
            <Sun className="w-5 h-5 text-amber-500" />
          )}
          <span className="flex-1 text-[15px] text-slate-900 dark:text-slate-100">Theme</span>
          <span className="text-sm text-slate-400 dark:text-slate-500 capitalize">{theme}</span>
        </button>
      </div>

      {/* Notifications */}
      {isNativeShell() && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={requestNotifications}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 dark:active:bg-slate-800/50"
          >
            <Server className="w-5 h-5 text-indigo-500" />
            <span className="flex-1 text-[15px] text-slate-900 dark:text-slate-100">
              Push Notifications
            </span>
          </button>
        </div>
      )}

      {/* Sync */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-indigo-500" />
            <span className="text-[15px] text-slate-900 dark:text-slate-100">Sync</span>
            {isConnected && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-3 h-3" />
                Connected
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Server URL
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 border-0 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                API Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 border-0 focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={saveSyncConfig}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-xl bg-indigo-600 text-white active:bg-indigo-700 transition-colors"
              >
                Save
              </button>
              {serverUrl && (
                <button
                  onClick={handleSyncNow}
                  disabled={syncStatus === 'syncing'}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
            </div>

            {syncStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Sync complete
              </div>
            )}
            {syncStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {syncError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Device Info */}
      {deviceInfo && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="w-5 h-5 text-slate-400" />
            <span className="text-[15px] text-slate-900 dark:text-slate-100">Device</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 ml-8">{deviceInfo}</p>
        </div>
      )}

      {/* About */}
      <div className="text-center py-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">Utral Todo Mobile v1.0</p>
      </div>
    </div>
  );
}
