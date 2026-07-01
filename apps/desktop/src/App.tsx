import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useCliBridge } from './hooks/useCliBridge';
import { useSync } from './hooks/useSync';
import { initIOSSync } from './db/iosSync';
import { initDatabase } from './db/database';
import { seedDefaultTimeSlots } from './db/timeSlotDefinitions';
import { Sidebar } from './components/layout/Sidebar';
import { QuickTodoModal } from './components/QuickTodoModal';
import { TodoNew } from './pages/TodoNew';
import { TodoExecute } from './pages/TodoExecute';
import { TodoDetail } from './pages/TodoDetail';
import { BigMap } from './pages/BigMap';
import { Today } from './pages/Today';
import { Todos } from './pages/Todos';
import { Schedule } from './pages/Schedule';
import { Settings } from './pages/Settings';
import { PluseList } from './pages/PluseList';
import { Labels } from './pages/Labels';


function AppLayout({ children }: { children: React.ReactNode }) {
  const [quickModalOpen, setQuickModalOpen] = useState(false);

  const openQuickModal = useCallback(() => setQuickModalOpen(true), []);
  const closeQuickModal = useCallback(() => setQuickModalOpen(false), []);

  // Global keyboard shortcut: Cmd/Ctrl+Shift+N to open quick add
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const hasModifier = e.metaKey || e.ctrlKey;
      const hasShift = e.shiftKey;
      if (e.key !== 'o' && e.key !== 'O') return;
      if (!hasModifier || !hasShift || e.altKey) return;
      e.preventDefault();
      setQuickModalOpen(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar onQuickCreate={openQuickModal} />
      <main className="flex-1 p-8 min-w-0 overflow-y-auto">
        {children}
      </main>
      <QuickTodoModal isOpen={quickModalOpen} onClose={closeQuickModal} />
    </div>
  );
}

const isTauri = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => seedDefaultTimeSlots())
      .then(() => {
        // ensureRootGoal().catch((err) => {
        //   console.error('[App] Failed to ensure root goal:', err);
        // });
        setDbReady(true);
      })
      .catch((err) => {
        console.error('[App] Failed to init database:', err);
        setDbError(String(err));
      });
  }, []);

  useEffect(() => {
    initIOSSync().catch((err) => {
      console.error('[App] iOS sync init failed:', err);
    });
  }, []);

  useEffect(() => {
    async function initNotifications() {
      if (!isTauri) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('request_notification_auth');
      } catch (err) {
        console.error('[App] Notification init failed:', err);
      }
    }
    initNotifications();
  }, []);

  if (dbError) {
    return <div className="p-8 text-red-600">Database init failed: {dbError}</div>;
  }

  if (!dbReady) {
    return <div className="p-8 text-slate-500">Initializing database...</div>;
  }

  return <AppInner />;
}

function AppInner() {
  useCliBridge();
  useSync();

  return (
    <BrowserRouter basename={isTauri ? '/' : '/desktop'}>
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout>
              <Today />
            </AppLayout>
          }
        />
        <Route
          path="/today"
          element={
            <AppLayout>
              <Today />
            </AppLayout>
          }
        />
        <Route
          path="/todos"
          element={
            <AppLayout>
              <Todos />
            </AppLayout>
          }
        />
        <Route
          path="/schedule"
          element={
            <AppLayout>
              <Schedule />
            </AppLayout>
          }
        />
        <Route
          path="/todo/new"
          element={
            <AppLayout>
              <TodoNew />
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
          path="/todo/:id/execute"
          element={
            <AppLayout>
              <TodoExecute />
            </AppLayout>
          }
        />
        <Route
          path="/map"
          element={
            <AppLayout>
              <BigMap />
            </AppLayout>
          }
        />
        <Route
          path="/pluses"
          element={
            <AppLayout>
              <PluseList />
            </AppLayout>
          }
        />

        <Route
          path="/settings"
          element={
            <AppLayout>
              <Settings />
            </AppLayout>
          }
        />
        <Route
          path="/labels"
          element={
            <AppLayout>
              <Labels />
            </AppLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
