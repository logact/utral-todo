import { useState } from 'react';
import { Moon, Sun, Trash2, AlertTriangle, Cloud, Dumbbell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { clearAllData } from '../db/database';
import { seedFitnessPlan } from '../db/seedFitness';

export function Settings() {
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [fitnessSeeded, setFitnessSeeded] = useState(false);
  const [fitnessError, setFitnessError] = useState('');
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

  async function handleSeedFitness() {
    try {
      await seedFitnessPlan();
      setFitnessSeeded(true);
      setFitnessError('');
      setTimeout(() => setFitnessSeeded(false), 3000);
    } catch (err) {
      setFitnessError(err instanceof Error ? err.message : 'Failed to add fitness plan');
    }
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

      {/* Templates */}
      <div className="mt-6 space-y-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Templates</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quick-start plan presets</p>
          </div>
        </div>

        {fitnessError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {fitnessError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSeedFitness}
            className="inline-flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <Dumbbell className="w-4 h-4" />
            {fitnessSeeded ? 'Added!' : 'Add Fitness Plan'}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Creates a "Fitness" project with 7 weekly recurring workouts.
          </p>
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
      </div>
    </div>
  );
}
