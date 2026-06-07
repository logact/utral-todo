import { useState, useCallback } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  CalendarCheck,
  ListTodo,
  Timer,
  Settings,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Today } from './pages/Today';
import { Todos } from './pages/Todos';
import { Pluses } from './pages/Pluses';
import { SettingsPage } from './pages/Settings';
import { TodoDetail } from './pages/TodoDetail';
import { PluseRun } from './pages/PluseRun';
import { addTodo } from './db/todos';

const navItems = [
  { path: '/', icon: CalendarCheck, label: 'Today' },
  { path: '/todos', icon: ListTodo, label: 'Todos' },
  { path: '/pluses', icon: Timer, label: 'Pluses' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

function BottomNav() {
  const location = useLocation();
  const pathname = location.pathname;

  // Hide bottom nav when running a pluse
  if (pathname.startsWith('/pluse/')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-700 pb-safe">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.path ||
            (item.path !== '/' && pathname.startsWith(item.path));

          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 w-16 h-full',
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function AppLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const location = useLocation();
  const pathname = location.pathname;

  // Hide header when running a pluse for full-screen experience
  const hideHeader = pathname.startsWith('/pluse/');

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      {title && !hideHeader && (
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 pt-safe">
          <div className="flex items-center h-12 px-4">
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h1>
          </div>
        </header>
      )}
      <main className="flex-1 pb-20 overflow-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const [quickOpen, setQuickOpen] = useState(false);

  const openQuick = useCallback(() => setQuickOpen(true), []);
  const closeQuick = useCallback(() => setQuickOpen(false), []);

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout title="Today">
              <Today onQuickCreate={openQuick} />
            </AppLayout>
          }
        />
        <Route
          path="/todos"
          element={
            <AppLayout title="Todos">
              <Todos />
            </AppLayout>
          }
        />
        <Route
          path="/todo/:id"
          element={
            <AppLayout>
              <TodoDetail />
            </AppLayout>
          }
        />
        <Route
          path="/pluses"
          element={
            <AppLayout title="Pluses">
              <Pluses />
            </AppLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <AppLayout title="Settings">
              <SettingsPage />
            </AppLayout>
          }
        />
        <Route
          path="/pluse/:id/run"
          element={
            <AppLayout>
              <PluseRun />
            </AppLayout>
          }
        />
      </Routes>

      {/* Quick Create FAB — hide on pluse run */}
      <QuickCreateFAB openQuick={openQuick} />

      {/* Quick Create Modal */}
      {quickOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={closeQuick}>
          <div
            className="bg-white dark:bg-slate-900 rounded-t-2xl w-full max-w-lg p-4 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Quick Add
              </h2>
              <button
                onClick={closeQuick}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <QuickCreateForm onClose={closeQuick} />
          </div>
        </div>
      )}
    </HashRouter>
  );
}

function QuickCreateFAB({ openQuick }: { openQuick: () => void }) {
  const location = useLocation();
  if (location.pathname.startsWith('/pluse/')) {
    return null;
  }
  return (
    <button
      onClick={openQuick}
      className="fixed right-4 bottom-20 z-50 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform"
      aria-label="Quick add"
    >
      <Zap className="w-5 h-5" />
    </button>
  );
}

function QuickCreateForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await addTodo({
      title: title.trim(),
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
    });
    setTitle('');
    setScheduledDate('');
    setShowSchedule(false);
    onClose();
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to be done?"
        autoFocus
        className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border-0 focus:ring-2 focus:ring-indigo-500"
      />

      {showSchedule && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Schedule for
          </label>
          <input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm border-0 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          onClick={() => setShowSchedule((s) => !s)}
          className={`text-xs font-medium px-3 py-2 rounded-xl transition-colors ${
            showSchedule
              ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {showSchedule ? 'Hide schedule' : 'Schedule'}
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium text-sm disabled:opacity-50 active:scale-95 transition-transform"
        >
          Add
        </button>
      </div>
    </form>
  );
}
