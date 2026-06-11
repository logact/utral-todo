import { useState, useRef, useEffect, useMemo, memo } from 'react';
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Pencil,
} from 'lucide-react';
import { useScheduleTodos } from '../hooks/useTodos';
import type { Todo, TodoStatus } from '../types';
import {
  addDays,
  addMinutes,
  addMonths,
  formatDateShort,
  formatDuration,
  formatTime,
  getHoursMinutes,
  getMonthGrid,
  getTimeOfDay,
  isSameDay,
  setTime,
  setTimeOfDay,
  timeOfDayLabel,
  type TimeOfDay,
} from '../utils/date';

type ViewMode = 'day' | 'week' | 'month' | 'year';

const VIEW_LABELS: Record<ViewMode, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function TimeEditor({
  date,
  onChange,
  onClose,
}: {
  date: Date;
  onChange: (newDate: Date) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { hours, minutes } = getHoursMinutes(date);
  const [timeValue, setTimeValue] = useState(
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  function apply() {
    const match = timeValue.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        onChange(setTime(date, h, m));
      }
    }
    onClose();
  }

  function adjust(deltaMinutes: number) {
    onChange(addMinutes(date, deltaMinutes));
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 min-w-[180px]"
    >
      <div className="flex items-center gap-2 mb-3">
        <input
          type="time"
          value={timeValue}
          onChange={(e) => setTimeValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
            if (e.key === 'Escape') onClose();
          }}
          className="w-full px-2 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <button
          onClick={() => adjust(-15)}
          className="text-[10px] px-1.5 py-1 rounded bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          -15m
        </button>
        <button
          onClick={() => adjust(-30)}
          className="text-[10px] px-1.5 py-1 rounded bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          -30m
        </button>
        <button
          onClick={() => adjust(-60)}
          className="text-[10px] px-1.5 py-1 rounded bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          -1h
        </button>
        <button
          onClick={() => adjust(15)}
          className="text-[10px] px-1.5 py-1 rounded bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          +15m
        </button>
        <button
          onClick={() => adjust(30)}
          className="text-[10px] px-1.5 py-1 rounded bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          +30m
        </button>
        <button
          onClick={() => adjust(60)}
          className="text-[10px] px-1.5 py-1 rounded bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        >
          +1h
        </button>
      </div>
      <div className="flex justify-end">
        <button
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}

const TodoItemRow = memo(function TodoItemRow({
  todo,
  schedule,
  setStatus,
  editingTimeTodoId,
  setEditingTimeTodoId,
}: {
  todo: Todo;
  schedule: (id: string, date: Date | undefined) => void;
  setStatus: (id: string, status: TodoStatus) => void;
  editingTimeTodoId: string | null;
  setEditingTimeTodoId: (id: string | null) => void;
}) {
  const isDone = todo.status === 'done';
  const isEditingTime = editingTimeTodoId === todo.id;
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <button
        onClick={() => setStatus(todo.id, isDone ? 'pending' : 'done')}
        className="shrink-0"
      >
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 hover:text-indigo-400 transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {(todo.scheduledDate || todo.scheduledEndDate) && (
            <span className="relative inline-flex items-center">
              <button
                onClick={() => setEditingTimeTodoId(todo.id)}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                title="Click to change time"
              >
                <Pencil className="w-2.5 h-2.5" />
                {todo.scheduledDate && formatTime(todo.scheduledDate)}
                {todo.scheduledDate && todo.scheduledEndDate && ' — '}
                {todo.scheduledEndDate && formatTime(todo.scheduledEndDate)}
              </button>
              {isEditingTime && (
                <div className="absolute top-full left-0 mt-1">
                  <TimeEditor
                    date={new Date(todo.scheduledDate || new Date())}
                    onChange={(newDate) => schedule(todo.id, newDate)}
                    onClose={() => setEditingTimeTodoId(null)}
                  />
                </div>
              )}
            </span>
          )}
          {(todo.scheduledDate || todo.scheduledEndDate) && (
            <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {formatDuration(todo.estimatedMinutes ?? 60)}
          </span>
        </div>
      </div>

      <button
        onClick={() => schedule(todo.id, undefined)}
        className="text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors shrink-0"
      >
        Unschedule
      </button>
    </div>
  );
});

const DayDetailPanel = memo(function DayDetailPanel({
  date,
  dayTodos,
  todayStr,
  schedule,
  setStatus,
  editingTimeTodoId,
  setEditingTimeTodoId,
}: {
  date: Date;
  dayTodos: Todo[];
  todayStr: string;
  schedule: (id: string, date: Date | undefined) => void;
  setStatus: (id: string, status: TodoStatus) => void;
  editingTimeTodoId: string | null;
  setEditingTimeTodoId: (id: string | null) => void;
}) {
  const totalMinutes = dayTodos.reduce((s, t) => s + (t.estimatedMinutes ?? 60), 0);

  const periods: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
  const grouped = useMemo(() => {
    const map = new Map<TimeOfDay, Todo[]>();
    for (const p of periods) map.set(p, []);
    for (const todo of dayTodos) {
      const tod = getTimeOfDay(todo.scheduledDate);
      map.get(tod)!.push(todo);
    }
    for (const p of periods) {
      const list = map.get(p)!;
      list.sort((a, b) => {
        if (a.scheduledDate && b.scheduledDate) {
          return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
        }
        return 0;
      });
    }
    return map;
  }, [dayTodos]);

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {date.toDateString() === todayStr ? 'Today' : formatDateShort(date)}
          </h2>
        </div>
        {dayTodos.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {dayTodos.length} todo{dayTodos.length > 1 ? 's' : ''} · {formatDuration(totalMinutes)}
          </span>
        )}
      </div>

      {dayTodos.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
          No todos scheduled for this day
        </p>
      ) : (
        <div className="space-y-5">
          {periods.map((tod) => {
            const list = grouped.get(tod)!;
            if (list.length === 0) return null;
            return (
              <div key={tod}>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {timeOfDayLabel(tod)}
                </h3>
                <div className="space-y-2">
                  {list.map((todo) => (
                    <TodoItemRow
                      key={todo.id}
                      todo={todo}
                      schedule={schedule}
                      setStatus={setStatus}
                      editingTimeTodoId={editingTimeTodoId}
                      setEditingTimeTodoId={setEditingTimeTodoId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export function Schedule() {
  const { todos, isLoading, schedule, setStatus, getForDate, unscheduled: unscheduledTodos } =
    useScheduleTodos();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingTimeTodoId, setEditingTimeTodoId] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState<string>('09:00');

  // Memoized computed values
  const weekDates = useMemo(() => {
    const ws = getWeekStart(viewDate);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [viewDate]);

  const monthGrid = useMemo(() => getMonthGrid(viewDate), [viewDate]);

  const yearViewData = useMemo(() => {
    const year = viewDate.getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const monthDate = new Date(year, m, 1);
      const grid = getMonthGrid(monthDate);
      const monthTodos = todos.filter((t) => {
        if (!t.scheduledDate) return false;
        const d = new Date(t.scheduledDate);
        return d.getFullYear() === year && d.getMonth() === m;
      });
      const totalMinutes = monthTodos.reduce((s, t) => s + (t.estimatedMinutes ?? 60), 0);
      return { monthDate, grid, monthTodos, totalMinutes };
    });
  }, [viewDate, todos]);

  const selectedDateTodos = useMemo(() => getForDate(selectedDate), [getForDate, selectedDate]);

  // Navigation
  function goPrev() {
    if (viewMode === 'day') setViewDate((d) => addDays(d, -1));
    else if (viewMode === 'week') setViewDate((d) => addDays(d, -7));
    else if (viewMode === 'month') setViewDate((d) => addMonths(d, -1));
    else setViewDate((d) => new Date(d.getFullYear() - 1, d.getMonth(), 1));
  }

  function goNext() {
    if (viewMode === 'day') setViewDate((d) => addDays(d, 1));
    else if (viewMode === 'week') setViewDate((d) => addDays(d, 7));
    else if (viewMode === 'month') setViewDate((d) => addMonths(d, 1));
    else setViewDate((d) => new Date(d.getFullYear() + 1, d.getMonth(), 1));
  }

  function goToday() {
    const today = new Date();
    setViewDate(today);
    setSelectedDate(today);
  }

  // Header range label
  function getRangeLabel(): string {
    if (viewMode === 'day') {
      return viewDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (viewMode === 'week') {
      const ws = getWeekStart(viewDate);
      const we = addDays(ws, 6);
      const sameYear = ws.getFullYear() === we.getFullYear();
      const startStr = ws.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const endStr = we.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return sameYear ? `${startStr} – ${endStr}` : `${startStr}, ${ws.getFullYear()} – ${endStr}`;
    }
    if (viewMode === 'month') {
      return viewDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
    return String(viewDate.getFullYear());
  }

  // Subtitle
  function getSubtitle(): string {
    switch (viewMode) {
      case 'day':
        return 'Focus on one day at a time';
      case 'week':
        return 'Plan your week and assign todos to days';
      case 'month':
        return 'See your schedule across the month';
      case 'year':
        return 'Overview of your entire year';
    }
  }

  const todayStr = new Date().toDateString();

  // Day view
  function renderDayView() {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <DayDetailPanel
          date={viewDate}
          dayTodos={getForDate(viewDate)}
          todayStr={todayStr}
          schedule={schedule}
          setStatus={setStatus}
          editingTimeTodoId={editingTimeTodoId}
          setEditingTimeTodoId={setEditingTimeTodoId}
        />
      </div>
    );
  }

  // Week view
  function renderWeekView() {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800">
          {weekDates.map((date) => {
            const isToday = date.toDateString() === todayStr;
            const isSelected = selectedDate.toDateString() === date.toDateString();
            const dayTodos = getForDate(date);
            const totalMinutes = dayTodos.reduce((s, t) => s + (t.estimatedMinutes ?? 60), 0);

            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={`p-3 text-center transition-colors ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="text-xs text-slate-500 dark:text-slate-400 uppercase">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div
                  className={`text-lg font-semibold mt-0.5 ${
                    isToday
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {date.getDate()}
                </div>
                {totalMinutes > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {formatDuration(totalMinutes)}
                  </div>
                )}
                {dayTodos.length > 0 && (
                  <div className="flex items-center justify-center gap-0.5 mt-1 flex-wrap px-1">
                    {dayTodos.slice(0, 5).map((t) => (
                      <div
                        key={t.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          t.status === 'done'
                            ? 'bg-emerald-400'
                            : t.status === 'in_progress'
                              ? 'bg-indigo-400'
                              : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                    ))}
                    {dayTodos.length > 5 && (
                      <span className="text-[8px] text-slate-400 dark:text-slate-500 ml-0.5">
                        +{dayTodos.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <DayDetailPanel
          date={selectedDate}
          dayTodos={selectedDateTodos}
          todayStr={todayStr}
          schedule={schedule}
          setStatus={setStatus}
          editingTimeTodoId={editingTimeTodoId}
          setEditingTimeTodoId={setEditingTimeTodoId}
        />
      </div>
    );
  }

  // Month view
  function renderMonthView() {
    const currentMonth = viewDate.getMonth();

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase"
            >
              {wd}
            </div>
          ))}
        </div>
        {/* Day grid */}
        <div className="grid grid-cols-7">
          {monthGrid.map((date, idx) => {
            const inMonth = date.getMonth() === currentMonth;
            const isToday = date.toDateString() === todayStr;
            const isSelected = selectedDate.toDateString() === date.toDateString();
            const dayTodos = getForDate(date);
            const totalMinutes = dayTodos.reduce((s, t) => s + (t.estimatedMinutes ?? 60), 0);

            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedDate(date);
                  if (!inMonth) setViewDate(date);
                }}
                className={`min-h-[72px] p-1.5 text-left transition-colors border-b border-r border-slate-100 dark:border-slate-800 ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                } ${!inMonth ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}
              >
                <div
                  className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : inMonth
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-400 dark:text-slate-600'
                  }`}
                >
                  {date.getDate()}
                </div>
                {totalMinutes > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDuration(totalMinutes)}
                  </div>
                )}
                {dayTodos.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-1 flex-wrap">
                    {dayTodos.slice(0, 4).map((t) => (
                      <div
                        key={t.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          t.status === 'done'
                            ? 'bg-emerald-400'
                            : t.status === 'in_progress'
                              ? 'bg-indigo-400'
                              : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                    ))}
                    {dayTodos.length > 4 && (
                      <span className="text-[8px] text-slate-400 dark:text-slate-500">
                        +{dayTodos.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <DayDetailPanel
          date={selectedDate}
          dayTodos={selectedDateTodos}
          todayStr={todayStr}
          schedule={schedule}
          setStatus={setStatus}
          editingTimeTodoId={editingTimeTodoId}
          setEditingTimeTodoId={setEditingTimeTodoId}
        />
      </div>
    );
  }

  // Year view
  function renderYearView() {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {yearViewData.map(({ monthDate, grid, monthTodos, totalMinutes }, mIdx) => (
          <button
            key={mIdx}
            onClick={() => {
              setViewDate(monthDate);
              setSelectedDate(monthDate);
              setViewMode('month');
            }}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-left hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {MONTH_NAMES[mIdx]}
              </h3>
              {monthTodos.length > 0 && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {monthTodos.length} · {formatDuration(totalMinutes)}
                </span>
              )}
            </div>
            {/* Mini calendar */}
            <div className="grid grid-cols-7 gap-0">
              {grid.map((date, idx) => {
                const inMonth = date.getMonth() === mIdx;
                const isToday = date.toDateString() === todayStr;
                const hasTodos = getForDate(date).length > 0;

                return (
                  <div
                    key={idx}
                    className={`aspect-square flex items-center justify-center text-[10px] rounded-sm ${
                      isToday
                        ? 'bg-indigo-600 text-white font-semibold'
                        : inMonth
                          ? hasTodos
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-600 dark:text-slate-400'
                          : 'text-slate-300 dark:text-slate-700'
                    }`}
                  >
                    {date.getDate()}
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // Schedule / reschedule panel — all non-done todos
  function renderSchedulePanel() {
    const scheduledElsewhere = todos.filter(
      (t) =>
        t.status !== 'done' &&
        t.scheduledDate &&
        !isSameDay(new Date(t.scheduledDate), selectedDate)
    );

    function renderScheduleControls(todoId: string) {
      return (
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {(['morning', 'afternoon', 'evening'] as TimeOfDay[]).map((tod) => (
            <button
              key={tod}
              onClick={() => schedule(todoId, setTimeOfDay(selectedDate, tod))}
              className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded-md hover:bg-indigo-700 transition-colors"
              title={`Schedule for ${timeOfDayLabel(tod)}`}
            >
              {timeOfDayLabel(tod).charAt(0)}
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const match = customTime.match(/^(\d{1,2}):(\d{2})$/);
                  if (match) {
                    const h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    schedule(todoId, setTime(selectedDate, h, m));
                  }
                }
              }}
              className="w-[72px] text-[10px] px-1.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                const match = customTime.match(/^(\d{1,2}):(\d{2})$/);
                if (match) {
                  const h = parseInt(match[1], 10);
                  const m = parseInt(match[2], 10);
                  schedule(todoId, setTime(selectedDate, h, m));
                }
              }}
              className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              title="Schedule at custom time"
            >
              Set
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            All Todos
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {unscheduledTodos.length} unscheduled · {scheduledElsewhere.length} elsewhere
          </span>
        </div>

        {unscheduledTodos.length === 0 && scheduledElsewhere.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
            All todos are done!
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {/* Unscheduled */}
            {unscheduledTodos.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                  Unscheduled
                </div>
                {unscheduledTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {todo.title}
                      </p>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {formatDuration(todo.estimatedMinutes ?? 60)}
                      </span>
                    </div>
                    {renderScheduleControls(todo.id)}
                  </div>
                ))}
              </div>
            )}

            {/* Scheduled elsewhere */}
            {scheduledElsewhere.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                  Scheduled Elsewhere
                </div>
                {scheduledElsewhere.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {todo.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          {todo.scheduledDate && formatDateShort(todo.scheduledDate)}
                          {todo.scheduledDate && ' '}
                          {todo.scheduledDate && formatTime(todo.scheduledDate)}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {formatDuration(todo.estimatedMinutes ?? 60)}
                        </span>
                      </div>
                    </div>
                    {renderScheduleControls(todo.id)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-slate-500 dark:text-slate-400">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Schedule
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {getSubtitle()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Today
          </button>
          <button
            onClick={goNext}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View switcher + range label */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setViewMode(mode);
                if (mode === 'day') setSelectedDate(viewDate);
              }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {getRangeLabel()}
        </span>
      </div>

      {/* View content */}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'year' && renderYearView()}

      {/* All todos panel */}
      {renderSchedulePanel()}
    </div>
  );
}
