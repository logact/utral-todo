import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowLeft, Trash2, Clock, Calendar, Bell, X, Timer } from 'lucide-react';
import { getTodo, updateTodo, updateTodoStatus, deleteTodo } from '../db/todos';
import type { Todo } from '@utral/types';
import { nativeHaptic, nativeNotification, isNativeShell } from '../bridge/native';

export function TodoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);

  // Scheduling state (must be before any early returns)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleInput, setScheduleInput] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);

  const [showDuePicker, setShowDuePicker] = useState(false);
  const [dueInput, setDueInput] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const t = await getTodo(id);
    setTodo(t ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when remote sync data arrives
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => load(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [load]);

  useEffect(() => {
    if (todo?.scheduledDate) {
      const d = new Date(todo.scheduledDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setScheduleInput(d.toISOString().slice(0, 16));
    } else {
      setScheduleInput('');
    }
  }, [todo?.scheduledDate, showSchedulePicker]);

  useEffect(() => {
    if (todo?.dueDate) {
      const d = new Date(todo.dueDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setDueInput(d.toISOString().slice(0, 16));
    } else {
      setDueInput('');
    }
  }, [todo?.dueDate, showDuePicker]);

  async function toggleStatus() {
    if (!todo) return;
    const newStatus = todo.status === 'done' ? 'pending' : 'done';
    await updateTodoStatus(todo.id, newStatus);
    nativeHaptic.impact('light').catch(() => {});
    setTodo({ ...todo, status: newStatus, completedAt: newStatus === 'done' ? new Date() : undefined });
  }

  async function handleDelete() {
    if (!todo || !confirm('Delete this task?')) return;
    await deleteTodo(todo.id);
    navigate(-1);
  }

  async function saveSchedule() {
    if (!todo) return;
    const scheduledDate = scheduleInput ? new Date(scheduleInput) : undefined;
    await updateTodo(todo.id, { scheduledDate });

    if (isNativeShell() && scheduledDate && scheduledDate > new Date() && reminderEnabled) {
      const permitted = await nativeNotification.requestPermission().catch(() => false);
      if (permitted) {
        await nativeNotification.schedule({
          id: `todo-${todo.id}`,
          title: todo.title,
          body: 'Your scheduled task is ready',
          date: scheduledDate.getTime(),
        });
      }
    }

    nativeHaptic.impact('light').catch(() => {});
    setTodo({ ...todo, scheduledDate });
    setShowSchedulePicker(false);
    setReminderEnabled(false);
  }

  async function clearSchedule() {
    if (!todo) return;
    await updateTodo(todo.id, { scheduledDate: undefined });
    if (isNativeShell()) {
      await nativeNotification.cancel(`todo-${todo.id}`).catch(() => {});
    }
    nativeHaptic.impact('light').catch(() => {});
    setTodo({ ...todo, scheduledDate: undefined });
    setShowSchedulePicker(false);
  }

  async function saveDueDate() {
    if (!todo) return;
    const dueDate = dueInput ? new Date(dueInput) : undefined;
    await updateTodo(todo.id, { dueDate });
    nativeHaptic.impact('light').catch(() => {});
    setTodo({ ...todo, dueDate });
    setShowDuePicker(false);
  }

  async function clearDueDate() {
    if (!todo) return;
    await updateTodo(todo.id, { dueDate: undefined });
    nativeHaptic.impact('light').catch(() => {});
    setTodo({ ...todo, dueDate: undefined });
    setShowDuePicker(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 dark:text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!todo) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-4">
        <p className="text-slate-400 dark:text-slate-500">Task not found</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-sm text-indigo-600 dark:text-indigo-400"
        >
          Go back
        </button>
      </div>
    );
  }

  const isDone = todo.status === 'done';
  const isInProgress = todo.status === 'in_progress';

  return (
    <div className="px-4 py-4">
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleDelete}
          className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      <div className="flex items-start gap-3 mb-4">
        <button onClick={toggleStatus} className="mt-1 shrink-0">
          {isDone ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600" />
          )}
        </button>
        <h1
          className={`text-xl font-semibold ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {todo.title}
        </h1>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 mb-6 ml-9">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            todo.priority === 'high'
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400'
              : todo.priority === 'medium'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {todo.priority}
        </span>
        {(todo.estimatedMinutes ?? 0) > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {todo.estimatedMinutes} min
          </span>
        )}

        {/* Scheduled date — interactive */}
        {showSchedulePicker ? (
          <div className="w-full mt-2 space-y-3">
            <input
              type="datetime-local"
              value={scheduleInput}
              onChange={(e) => setScheduleInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm border-0 focus:ring-2 focus:ring-indigo-500"
            />
            {isNativeShell() && scheduleInput && new Date(scheduleInput) > new Date() && (
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Bell className="w-3.5 h-3.5" />
                Remind me
              </label>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveSchedule}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
              >
                Save
              </button>
              {todo.scheduledDate && (
                <button
                  onClick={clearSchedule}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowSchedulePicker(false)}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSchedulePicker(true)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
              todo.scheduledDate
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Clock className="w-3 h-3" />
            {todo.scheduledDate
              ? new Date(todo.scheduledDate).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })
              : 'Schedule'}
          </button>
        )}

        {/* Due date — interactive */}
        {showDuePicker ? (
          <div className="w-full mt-2 space-y-3">
            <input
              type="datetime-local"
              value={dueInput}
              onChange={(e) => setDueInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm border-0 focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={saveDueDate}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
              >
                Save
              </button>
              {todo.dueDate && (
                <button
                  onClick={clearDueDate}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowDuePicker(false)}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDuePicker(true)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
              todo.dueDate
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Calendar className="w-3 h-3" />
            {todo.dueDate
              ? `Due ${new Date(todo.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : 'Set due'}
          </button>
        )}
      </div>

      {/* Description */}
      {todo.description && (
        <div className="mb-6 ml-9">
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
            {todo.description}
          </p>
        </div>
      )}

      {/* Status badge */}
      {!isDone && isInProgress && (
        <div className="ml-9">
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Timer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                In Progress
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
