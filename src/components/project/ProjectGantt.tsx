import { useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { Todo, Project } from '../../types';

interface ProjectGanttProps {
  project: Project;
  todos: Todo[];
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>;
}

const DAY_WIDTH = 40;
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 40;
const TASK_COL_WIDTH = 200;

export function ProjectGantt({ todos }: ProjectGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Only show todos with scheduledDate or dueDate
  const ganttTodos = useMemo(() => {
    return todos
      .filter((t) => t.scheduledDate || t.dueDate)
      .sort((a, b) => {
        const aDate = a.scheduledDate || a.dueDate;
        const bDate = b.scheduledDate || b.dueDate;
        if (!aDate || !bDate) return 0;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
  }, [todos]);

  // Compute date range
  const { startDate, endDate, totalDays } = useMemo(() => {
    if (ganttTodos.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setDate(end.getDate() + 14);
      return { startDate: today, endDate: end, totalDays: 14 };
    }

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const todo of ganttTodos) {
      const start = todo.scheduledDate ? new Date(todo.scheduledDate) : null;
      const end = todo.dueDate ? new Date(todo.dueDate) : start;

      if (start) {
        if (!minDate || start < minDate) minDate = new Date(start);
      }
      if (end) {
        if (!maxDate || end > maxDate) maxDate = new Date(end);
      }
    }

    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date(minDate);

    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(0, 0, 0, 0);

    // Add padding
    const paddedStart = new Date(minDate);
    paddedStart.setDate(paddedStart.getDate() - 3);
    const paddedEnd = new Date(maxDate);
    paddedEnd.setDate(paddedEnd.getDate() + 7);

    const diffMs = paddedEnd.getTime() - paddedStart.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return { startDate: paddedStart, endDate: paddedEnd, totalDays: Math.max(diffDays, 14) };
  }, [ganttTodos]);

  const getDayOffset = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffMs = d.getTime() - startDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const getTodoBar = (todo: Todo) => {
    const start = todo.scheduledDate ? new Date(todo.scheduledDate) : null;
    const end = todo.dueDate ? new Date(todo.dueDate) : start;

    if (!start && !end) return null;

    let startDay = start ? getDayOffset(start) : 0;
    let endDay = end ? getDayOffset(end) : startDay;

    // If no due date, show as 1-day bar
    if (!end || endDay === startDay) {
      endDay = startDay + 1;
    }

    const barStart = startDay * DAY_WIDTH;
    const barWidth = Math.max((endDay - startDay) * DAY_WIDTH, DAY_WIDTH * 0.8);

    return { x: barStart, width: barWidth, startDay, endDay };
  };

  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, [startDate, totalDays]);

  const todayOffset = getDayOffset(new Date());
  const isTodayVisible = todayOffset >= 0 && todayOffset < totalDays;

  // Scroll to today on mount
  useEffect(() => {
    if (isTodayVisible && containerRef.current) {
      const scrollTo = todayOffset * DAY_WIDTH - containerRef.current.clientWidth / 2;
      containerRef.current.scrollLeft = Math.max(0, scrollTo);
    }
  }, [isTodayVisible, todayOffset]);

  if (ganttTodos.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <CalendarDays className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 dark:text-slate-400">
          No scheduled todos yet. Add scheduled dates to todos to see them here.
        </p>
      </div>
    );
  }

  const chartWidth = totalDays * DAY_WIDTH;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => containerRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => containerRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gantt chart */}
      <div ref={containerRef} className="overflow-x-auto">
        <div style={{ width: TASK_COL_WIDTH + chartWidth }}>
          {/* Header row */}
          <div className="flex" style={{ height: HEADER_HEIGHT }}>
            <div
              className="flex-shrink-0 border-r border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center px-3 text-xs font-medium text-slate-500 dark:text-slate-400 sticky left-0 z-10"
              style={{ width: TASK_COL_WIDTH }}
            >
              Task
            </div>
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              {days.map((day, i) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const isToday = i === todayOffset;
                return (
                  <div
                    key={i}
                    className={clsx(
                      'flex flex-col items-center justify-center border-r border-slate-100 dark:border-slate-800 text-xs',
                      isWeekend && 'bg-slate-50 dark:bg-slate-900/30',
                      isToday && 'bg-indigo-50 dark:bg-indigo-950/20'
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span className={clsx('font-medium', isToday && 'text-indigo-600 dark:text-indigo-400')}>
                      {day.getDate()}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                      {day.toLocaleDateString(undefined, { weekday: 'narrow' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task rows */}
          {ganttTodos.map((todo) => {
            const bar = getTodoBar(todo);
            const statusColor =
              todo.status === 'done'
                ? '#10b981'
                : todo.status === 'in_progress'
                ? '#3b82f6'
                : '#94a3b8';

            return (
              <div key={todo.id} className="flex" style={{ height: ROW_HEIGHT }}>
                <div
                  className="flex-shrink-0 border-r border-b border-slate-200 dark:border-slate-700 flex items-center px-3 text-sm sticky left-0 z-10 bg-white dark:bg-slate-900"
                  style={{ width: TASK_COL_WIDTH }}
                >
                  <Link
                    to={`/todo/${todo.id}`}
                    className="truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-slate-900 dark:text-slate-100"
                    title={todo.title}
                  >
                    {todo.title}
                  </Link>
                </div>
                <div className="flex relative border-b border-slate-200 dark:border-slate-700">
                  {days.map((day, i) => {
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const isToday = i === todayOffset;
                    return (
                      <div
                        key={i}
                        className={clsx(
                          'border-r border-slate-100 dark:border-slate-800',
                          isWeekend && 'bg-slate-50 dark:bg-slate-900/30',
                          isToday && 'bg-indigo-50/30 dark:bg-indigo-950/10'
                        )}
                        style={{ width: DAY_WIDTH }}
                      />
                    );
                  })}

                  {/* Today line */}
                  {isTodayVisible && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 dark:bg-red-500 z-10"
                      style={{ left: todayOffset * DAY_WIDTH }}
                    />
                  )}

                  {/* Task bar */}
                  {bar && (
                    <div
                      className="absolute top-2 h-7 rounded-md flex items-center px-2 text-xs font-medium text-white truncate cursor-pointer hover:opacity-90 transition-opacity"
                      style={{
                        left: bar.x,
                        width: bar.width,
                        backgroundColor: statusColor,
                      }}
                      title={`${todo.title} (${new Date(todo.scheduledDate || todo.dueDate!).toLocaleDateString()}${todo.dueDate ? ' - ' + new Date(todo.dueDate).toLocaleDateString() : ''})`}
                    >
                      {bar.width > 60 && todo.title}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
