import { useState, useEffect } from 'react';
import { Moon, Sun, Smartphone, Server } from 'lucide-react';
import { nativeDevice, nativeNotification, isNativeShell } from '../bridge/native';

export function SettingsPage() {
  const [deviceInfo, setDeviceInfo] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  useEffect(() => {
    if (isNativeShell()) {
      nativeDevice.getInfo().then((info) => {
        setDeviceInfo(`${info.model} · iOS ${info.systemVersion}`);
      }).catch(() => {});
    }
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
