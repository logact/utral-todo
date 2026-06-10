import { useMemo, useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import type { Todo, Project } from '../../types';

interface ProjectGanttProps {
  project: Project;
  todos: Todo[];
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>;
}

const DAY_WIDTH = 40;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;
const TASK_COL_WIDTH = 240;

export function ProjectGantt({ todos, onUpdateTodo }: ProjectGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'start' | 'end' | null>(null);
  const [dragDeltaDays, setDragDeltaDays] = useState(0);
  const dragStart = useRef({ x: 0, barX: 0, barWidth: 0, startDay: 0, endDay: 0 });

  // Only show todos with scheduledDate, scheduledEndDate, or dueDate
  const ganttTodos = useMemo(() => {
    return todos
      .filter((t) => t.scheduledDate || t.scheduledEndDate || t.dueDate)
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
      const end = todo.scheduledEndDate ? new Date(todo.scheduledEndDate) : todo.dueDate ? new Date(todo.dueDate) : start;
      const due = todo.dueDate ? new Date(todo.dueDate) : null;

      if (start) {
        if (!minDate || start < minDate) minDate = new Date(start);
      }
      if (end) {
        if (!maxDate || end > maxDate) maxDate = new Date(end);
      }
      if (due) {
        if (!maxDate || due > maxDate) maxDate = new Date(due);
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
    if (!todo.scheduledDate) return null;

    const start = new Date(todo.scheduledDate);
    const startDay = getDayOffset(start);

    if (todo.scheduledEndDate) {
      const end = new Date(todo.scheduledEndDate);
      const endDay = getDayOffset(end);
      const barWidth = Math.max((endDay - startDay + 1) * DAY_WIDTH, DAY_WIDTH * 0.8);
      return { x: startDay * DAY_WIDTH, width: barWidth, startDay, endDay };
    }

    // No scheduledEndDate: show as 1-day bar
    return { x: startDay * DAY_WIDTH, width: DAY_WIDTH * 0.8, startDay, endDay: startDay + 1 };
  };

  const getDueDateOffset = (todo: Todo) => {
    if (!todo.dueDate) return null;
    return getDayOffset(new Date(todo.dueDate));
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
          {isTodayVisible && (
            <button
              onClick={() => {
                if (!containerRef.current) return;
                const scrollTo = todayOffset * DAY_WIDTH - containerRef.current.clientWidth / 2;
                containerRef.current.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
              }}
              className="px-2 py-1 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
            >
              Today
            </button>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#94a3b8' }} />
            <span>scheduled</span>
            <div className="w-0.5 h-3 bg-amber-500 dark:bg-amber-400 relative ml-1">
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rotate-45 bg-amber-500 dark:bg-amber-400" />
            </div>
            <span>due</span>
          </div>
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
                const isSaturday = day.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={clsx(
                      'flex flex-col items-center justify-center border-slate-100 dark:border-slate-800 text-xs',
                      isSaturday ? 'border-r-0' : 'border-r',
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
            const dueOffset = getDueDateOffset(todo);
            const statusColor =
              todo.status === 'done'
                ? '#10b981'
                : todo.status === 'in_progress'
                ? '#3b82f6'
                : '#94a3b8';
            const isDragging = draggingId === todo.id;

            const handlePointerDown = (mode: 'move' | 'start' | 'end', e: React.PointerEvent) => {
              e.stopPropagation();
              const barEl = (e.currentTarget as HTMLElement).parentElement;
              if (barEl) barEl.setPointerCapture(e.pointerId);
              dragStart.current = {
                x: e.clientX,
                barX: bar?.x ?? 0,
                barWidth: bar?.width ?? 0,
                startDay: bar?.startDay ?? 0,
                endDay: bar?.endDay ?? 0,
              };
              setDraggingId(todo.id);
              setDragMode(mode);
              setDragDeltaDays(0);
            };

            const handlePointerMove = (e: React.PointerEvent) => {
              if (!isDragging || !dragMode) return;
              const rawDelta = e.clientX - dragStart.current.x;
              const dayDelta = Math.round(rawDelta / DAY_WIDTH);
              setDragDeltaDays(dayDelta);
            };

            const handlePointerUp = () => {
              if (!isDragging || !bar || !dragMode) {
                setDraggingId(null);
                setDragMode(null);
                setDragDeltaDays(0);
                return;
              }
              if (dragMode === 'move' && dragDeltaDays !== 0) {
                const newStartDay = bar.startDay + dragDeltaDays;
                const newDate = new Date(startDate);
                newDate.setDate(newDate.getDate() + newStartDay);
                onUpdateTodo(todo.id, { scheduledDate: newDate });
              } else if (dragMode === 'start' && dragDeltaDays !== 0) {
                const newStartDay = dragStart.current.startDay + dragDeltaDays;
                const newEndDay = dragStart.current.endDay;
                if (newStartDay <= newEndDay) {
                  const newDate = new Date(startDate);
                  newDate.setDate(newDate.getDate() + newStartDay);
                  onUpdateTodo(todo.id, { scheduledDate: newDate });
                }
              } else if (dragMode === 'end' && dragDeltaDays !== 0) {
                const newStartDay = dragStart.current.startDay;
                const newEndDay = dragStart.current.endDay + dragDeltaDays;
                if (newEndDay >= newStartDay) {
                  const newDate = new Date(startDate);
                  newDate.setDate(newDate.getDate() + newEndDay);
                  onUpdateTodo(todo.id, { scheduledEndDate: newDate });
                }
              }
              setDraggingId(null);
              setDragMode(null);
              setDragDeltaDays(0);
            };

            const tooltipParts: string[] = [];
            if (todo.scheduledDate) tooltipParts.push(new Date(todo.scheduledDate).toLocaleDateString());
            if (todo.scheduledEndDate) tooltipParts.push(' - ' + new Date(todo.scheduledEndDate).toLocaleDateString());
            if (todo.dueDate && !todo.scheduledEndDate) tooltipParts.push(' (due: ' + new Date(todo.dueDate).toLocaleDateString() + ')');
            const tooltipText = `${todo.title}${tooltipParts.length > 0 ? ' (' + tooltipParts.join('') + ')' : ''}`;

            return (
              <div key={todo.id} className="flex" style={{ height: ROW_HEIGHT }}>
                <div
                  className="flex-shrink-0 border-r border-b border-slate-200 dark:border-slate-700 flex items-center px-3 text-sm sticky left-0 z-10 bg-white dark:bg-slate-900"
                  style={{ width: TASK_COL_WIDTH, borderLeftWidth: 3, borderLeftColor: statusColor }}
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
                    const isSaturday = day.getDay() === 6;
                    return (
                      <div
                        key={i}
                        className={clsx(
                          'border-slate-100 dark:border-slate-800',
                          isSaturday ? 'border-r-0' : 'border-r',
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

                  {/* Due date marker */}
                  {dueOffset !== null && dueOffset >= 0 && dueOffset < totalDays && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-500 dark:bg-amber-400 z-10"
                      style={{ left: dueOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                      title={`Due: ${new Date(todo.dueDate!).toLocaleDateString()}`}
                    >
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-amber-500 dark:bg-amber-400" />
                    </div>
                  )}

                  {/* Task bar */}
                  {bar && (() => {
                    let previewLeft = bar.x;
                    let previewWidth = Math.max(bar.width, DAY_WIDTH * 0.8);
                    if (isDragging && dragMode === 'move') {
                      previewLeft = bar.x + dragDeltaDays * DAY_WIDTH;
                    } else if (isDragging && dragMode === 'start') {
                      const newStartDay = dragStart.current.startDay + dragDeltaDays;
                      const newEndDay = dragStart.current.endDay;
                      if (newStartDay <= newEndDay) {
                        previewLeft = newStartDay * DAY_WIDTH;
                        previewWidth = Math.max((newEndDay - newStartDay + 1) * DAY_WIDTH, DAY_WIDTH * 0.8);
                      }
                    } else if (isDragging && dragMode === 'end') {
                      const newStartDay = dragStart.current.startDay;
                      const newEndDay = dragStart.current.endDay + dragDeltaDays;
                      if (newEndDay >= newStartDay) {
                        previewWidth = Math.max((newEndDay - newStartDay + 1) * DAY_WIDTH, DAY_WIDTH * 0.8);
                      }
                    }
                    return (
                      <div
                        className={clsx(
                          'absolute top-1.5 h-6 rounded-md flex items-center justify-center text-xs font-medium text-white truncate select-none',
                          isDragging ? 'cursor-grabbing z-20' : 'cursor-grab hover:opacity-90'
                        )}
                        style={{
                          left: previewLeft,
                          width: previewWidth,
                          backgroundColor: statusColor,
                        }}
                        title={tooltipText}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                      >
                        <div
                          className="absolute inset-y-0 left-0 w-3 cursor-w-resize z-10"
                          onPointerDown={(e) => handlePointerDown('start', e)}
                          title="Drag to change start date"
                        />
                        <div
                          className="absolute inset-0 z-0"
                          onPointerDown={(e) => handlePointerDown('move', e)}
                        />
                        <div
                          className="absolute inset-y-0 right-0 w-3 cursor-e-resize z-10"
                          onPointerDown={(e) => handlePointerDown('end', e)}
                          title="Drag to change end date"
                        />
                        <span className="relative z-0 pointer-events-none">
                          {bar.width > 60 ? todo.title : <Clock className="w-3 h-3" />}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
