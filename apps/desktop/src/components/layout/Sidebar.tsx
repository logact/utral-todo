import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, CalendarCheck, CalendarDays, Settings, Network, Timer, ChevronLeft, ChevronRight, ListTodo, FolderKanban, Zap, Cloud } from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { path: '/', icon: CalendarCheck, label: 'Today' },
  { path: '/todos', icon: ListTodo, label: 'Todos' },
  { path: '/todo/new', icon: Plus, label: 'New Todo' },
  { path: '/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/schedule', icon: CalendarDays, label: 'Schedule' },
  { path: '/pluses', icon: Timer, label: 'Pluse' },
  { path: '/map', icon: Network, label: 'Road to Goal' },
  { path: '/sync', icon: Cloud, label: 'Sync' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  onQuickCreate?: () => void;
}

export function Sidebar({ onQuickCreate }: SidebarProps) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const shortcutLabel = useMemo(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    return isMac ? '⌘⇧O' : 'Ctrl+Shift+O';
  }, []);

  return (
    <aside
      className={clsx(
        'bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col min-h-screen sticky top-0 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className={clsx('flex items-center', collapsed ? 'p-3 justify-center' : 'p-5 justify-between')}>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Utral Todo</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {(typeof window !== 'undefined' && (window as any).__bridge__?.platformName) || 'Desktop'}
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Quick Create Button */}
      <div className={clsx('pb-2', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={onQuickCreate}
          title={collapsed ? `Quick Add (${shortcutLabel})` : undefined}
          className={clsx(
            'w-full flex items-center rounded-lg text-sm font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-700',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-2 px-3 py-2.5'
          )}
        >
          <Zap className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <span className="flex items-center gap-2 flex-1">
              Quick Add
              <kbd className="ml-auto px-1.5 py-0.5 rounded bg-indigo-500 text-indigo-100 text-[10px] font-mono">{shortcutLabel}</kbd>
            </span>
          )}
        </button>
      </div>

      <nav className={clsx('flex-1 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={clsx(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
