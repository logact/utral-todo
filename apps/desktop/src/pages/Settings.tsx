import { useState } from 'react';
import { Moon, Sun, Trash2, AlertTriangle, Cloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { clearAllData } from '../db/database';

export function Settings() {
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const { theme, toggleTheme } = useTheme();

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

      {/* Sync */}
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
        <Link
          to="/sync"
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <Cloud className="w-4 h-4" />
          Open Sync Settings
        </Link>
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
      </div>
    </div>
  );
}
