import { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, X, Plus, Target, CheckSquare, Brain } from 'lucide-react';
import { createTodo } from '../db/todos';
import { extractAtSchedule } from '../utils/atScheduleParser';
import { formatDate, formatTime, setTimeOfDay, startOfDay, type TimeOfDay } from '../utils/date';
import type { NodeType, TaskPattern } from '../types';

interface QuickTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function QuickTodoModal({ isOpen, onClose, onCreated }: QuickTodoModalProps) {
  const [rawInput, setRawInput] = useState('');
  
  // const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [nodeType, setNodeType] = useState<NodeType>('task');
  const [pattern, setPattern] = useState<TaskPattern>('task');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTask = nodeType === 'task';

  const result = extractAtSchedule(rawInput);
  const parsedTitle:string = result.title.trim() === '' ? '' : result.title.trim();

  // Derive scheduledDate: use parsed result if no manual override
  const effectiveScheduledDate = scheduledDate ?? result.scheduledDate;

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRawInput('');
      setNodeType('task');
      setPattern('task');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Parse @ schedule hints in real-time

  const handleSubmit = useCallback(async () => {
    const title = parsedTitle || rawInput.trim();
    if (!title || isSubmitting) return;

    setIsSubmitting(true);

    debugger
    await createTodo(title, {
      nodeType,
      ...(isTask
        ? {
            scheduledDate: effectiveScheduledDate,
            priority: 'medium',
            estimatedMinutes: 60,
            pattern,
          }
        : {
            goalStatus: 'active',
          }),
    });

    onCreated?.();
    onClose();
  }, [parsedTitle, rawInput, scheduledDate, isSubmitting, onCreated, onClose, nodeType, isTask, pattern]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      // Tab between node types when input is focused
      if (e.key === 'Tab' && document.activeElement === inputRef.current) {
        if (e.shiftKey) return; // let shift+tab work normally
        e.preventDefault();
        setNodeType((prev) => (prev === 'task' ? 'goal' : 'task'));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleSubmit]);

  function applyTimeOfDay(tod: TimeOfDay) {
    const base = effectiveScheduledDate ? startOfDay(new Date(effectiveScheduledDate)) : startOfDay(new Date());
    const updated = setTimeOfDay(base, tod);
    setScheduledDate(updated);
  }

  if (!isOpen) return null;

  const hasSchedule = !!effectiveScheduledDate;
  const showPreview = hasSchedule && parsedTitle && parsedTitle !== rawInput.trim();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] pointer-events-none">
        <div
          className="w-full max-w-lg mx-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Quick Add
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Input */}
          <div className="px-5 py-4 space-y-4">
            {/* Node type toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNodeType('task')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isTask
                    ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Task
              </button>
              <button
                type="button"
                onClick={() => setNodeType('goal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !isTask
                    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                Goal
              </button>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={rawInput}
              onChange={(e) =>{
                  setRawInput(e.target.value)
         
              } }
              placeholder={isTask ? "What needs to be done? Use @tomorrow, @3pm, etc." : "What do you want to achieve?"}
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />

            {/* Pattern selector (task only) */}
            {isTask && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Pattern:</span>
                <button
                  type="button"
                  onClick={() => setPattern('task')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    pattern === 'task'
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <CheckSquare className="w-3 h-3" />
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setPattern('cognitive')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    pattern === 'cognitive'
                      ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Brain className="w-3 h-3" />
                  Cognitive
                </button>
              </div>
            )}

            {/* Schedule preview */}
            {showPreview && effectiveScheduledDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{parsedTitle}</span>
                  {' → scheduled '}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatDate(effectiveScheduledDate)}
                    {effectiveScheduledDate.getHours() !== 9 && (
                      <span> at {formatTime(effectiveScheduledDate)}</span>
                    )}
                  </span>
                </span>
              </div>
            )}

            {/* Time of day chips */}
            {hasSchedule && effectiveScheduledDate && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Time:</span>
                {(['morning', 'afternoon', 'evening'] as TimeOfDay[]).map((tod) => {
                  const todDate = setTimeOfDay(
                    startOfDay(new Date(effectiveScheduledDate)),
                    tod
                  );
                  const isActive = effectiveScheduledDate.getHours() === todDate.getHours();
                  return (
                    <button
                      key={tod}
                      type="button"
                      onClick={() => applyTimeOfDay(tod)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tod.charAt(0).toUpperCase() + tod.slice(1)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono">Enter</kbd> create · <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono">Esc</kbd> close · <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono">Tab</kbd> switch type
            </span>
            <button
              onClick={handleSubmit}
              disabled={!rawInput.trim() || isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : isTask ? 'Create Task' : 'Create Goal'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
