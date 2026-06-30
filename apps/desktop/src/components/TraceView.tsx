import { Zap, Brain, X, CheckCircle2, Activity, CheckSquare, Trash2, Play } from 'lucide-react';
import { formatTime } from '../utils/date';
import { hlcToDate } from '../types';
import type { TodoLog, TodoLogType } from '../types';

/* ------------------------------------------------------------------ */
/*  Log grouping helpers                                               */
/* ------------------------------------------------------------------ */

interface LogSession {
  startTime: Date;
  logs: TodoLog[];
}

interface LogDayGroup {
  dateLabel: string;
  sessions: LogSession[];
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function groupLogsByDayAndSession(logs: TodoLog[]): LogDayGroup[] {
  if (logs.length === 0) return [];

  const groups: LogDayGroup[] = [];
  let currentDay: LogDayGroup | null = null;
  let currentSession: LogSession | null = null;
  let lastTime: Date | null = null;

  const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

  for (const log of logs) {
    const logDate = hlcToDate(log.createdAt);

    // New day?
    if (!currentDay || !isSameDay(logDate, new Date(currentDay.sessions[0]?.startTime ?? logDate))) {
      if (currentDay) groups.push(currentDay);
      currentDay = {
        dateLabel: logDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: logDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
        }),
        sessions: [],
      };
      currentSession = null;
      lastTime = null;
    }

    // New session? (first log of day or gap > 30 min)
    if (!currentSession || !lastTime || logDate.getTime() - lastTime.getTime() > SESSION_GAP_MS) {
      currentSession = { startTime: logDate, logs: [] };
      currentDay.sessions.push(currentSession);
    }

    currentSession.logs.push(log);
    lastTime = logDate;
  }

  if (currentDay) groups.push(currentDay);
  return groups;
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function logTypeIcon(type: TodoLogType) {
  switch (type) {
    case 'progress': return Zap;
    case 'thought': return Brain;
    case 'blocker': return X;
    case 'decision': return CheckCircle2;
    case 'system': return Activity;
    case 'step_complete': return CheckSquare;
    case 'exec': return Play;
    default: return Zap;
  }
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function logTypeColor(type: TodoLogType): string {
  switch (type) {
    case 'progress': return 'text-indigo-500';
    case 'thought': return 'text-amber-500';
    case 'blocker': return 'text-rose-500';
    case 'decision': return 'text-emerald-500';
    case 'system': return 'text-slate-400';
    case 'step_complete': return 'text-teal-500';
    case 'exec': return 'text-violet-500';
    default: return 'text-slate-400';
  }
}

function LogEntry({ log, onDelete }: { log: TodoLog; onDelete?: (id: string) => void }) {
  const Icon = logTypeIcon(log.type);
  const isSystem = log.type === 'system';

  return (
    <div className={`group flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 ${isSystem ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} transition-colors`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${logTypeColor(log.type)}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed ${isSystem ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-700 dark:text-slate-300'}`}>
          {log.content}
        </p>
        {log.minutesSpent !== undefined && log.minutesSpent > 0 && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            +{formatTime(new Date(0, 0, 0, 0, log.minutesSpent))}
          </span>
        )}
      </div>
      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 mt-0.5 font-mono">
        {formatTime(hlcToDate(log.createdAt))}
      </span>
      {onDelete && log.type !== 'system' && (
        <button
          onClick={() => onDelete(log.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-all shrink-0 p-0.5"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TraceView — read-only grouped log display                          */
/* ------------------------------------------------------------------ */

export function TraceView({
  logs,
  onDelete,
  maxHeight = 'max-h-80',
}: {
  logs: TodoLog[];
  onDelete?: (id: string) => void;
  maxHeight?: string;
}) {
  const grouped = groupLogsByDayAndSession(logs);

  if (logs.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
        No execution trace yet. Start working on this task to build a trace.
      </p>
    );
  }

  return (
    <div className={`overflow-y-auto ${maxHeight} space-y-4`}>
      {grouped.map((day, dayIdx) => (
        <div key={day.dateLabel + dayIdx}>
          {/* Day header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {day.dateLabel}
            </span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
          </div>

          {/* Sessions within day */}
          <div className="space-y-3">
            {day.sessions.map((session, sessIdx) => (
              <div key={sessIdx}>
                {sessIdx > 0 && (
                  <div className="flex items-center gap-2 my-2">
                    <span className="text-[10px] text-slate-300 dark:text-slate-600">
                      Session break
                    </span>
                    <div className="flex-1 h-px bg-slate-50 dark:bg-slate-800/50" />
                  </div>
                )}
                <div className="space-y-0.5">
                  {session.logs.map((log) => (
                    <LogEntry key={log.id} log={log} onDelete={onDelete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
