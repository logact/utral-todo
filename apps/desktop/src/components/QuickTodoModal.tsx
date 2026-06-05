import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Calendar, X, Plus } from 'lucide-react';
import { createTodo } from '../db/todos';
import { extractAtSchedule } from '../utils/atScheduleParser';
import { formatDate, formatTime, setTimeOfDay, startOfDay, type TimeOfDay } from '../utils/date';

interface QuickTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function QuickTodoModal({ isOpen, onClose, onCreated }: QuickTodoModalProps) {
  const [rawInput, setRawInput] = useState('');
  const [parsedTitle, setParsedTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setParsedTitle('');
      setScheduledDate(undefined);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Parse @ schedule hints in real-time
  useEffect(() => {
    const result = extractAtSchedule(rawInput);
    setParsedTitle(result.title);
    setScheduledDate(result.scheduledDate);
  }, [rawInput]);

  const handleSubmit = useCallback(async () => {
    const title = parsedTitle || rawInput.trim();
    if (!title || isSubmitting) return;

    setIsSubmitting(true);
    await createTodo(title, {
      scheduledDate,
      priority: 'medium',
      estimatedMinutes: 60,
    });

    onCreated?.();
    onClose();
  }, [parsedTitle, rawInput, scheduledDate, isSubmitting, onCreated, onClose]);

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
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleSubmit]);

  function applyTimeOfDay(tod: TimeOfDay) {
    const base = scheduledDate ? startOfDay(new Date(scheduledDate)) : startOfDay(new Date());
    const updated = setTimeOfDay(base, tod);
    setScheduledDate(updated);
  }

  const shortcutLabel = useMemo(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    return isMac ? '⌘⇧O' : 'Ctrl+Shift+O';
  }, []);

  if (!isOpen) return null;

  const hasSchedule = !!scheduledDate;
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
          <div className="px-5 py-4">
            <input
              ref={inputRef}
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="What needs to be done? Use @tomorrow, @3pm, etc."
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />

            {/* Schedule preview */}
            {showPreview && scheduledDate && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{parsedTitle}</span>
                  {' → scheduled '}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatDate(scheduledDate)}
                    {scheduledDate.getHours() !== 9 && (
                      <span> at {formatTime(scheduledDate)}</span>
                    )}
                  </span>
                </span>
              </div>
            )}

            {/* Time of day chips */}
            {hasSchedule && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Time:</span>
                {(['morning', 'afternoon', 'evening'] as TimeOfDay[]).map((tod) => {
                  const todDate = setTimeOfDay(
                    startOfDay(new Date(scheduledDate)),
                    tod
                  );
                  const isActive = scheduledDate.getHours() === todDate.getHours();
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
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono">Enter</kbd> create · <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono">Esc</kbd> close · <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-mono">{shortcutLabel}</kbd> reopen
            </span>
            <button
              onClick={handleSubmit}
              disabled={!rawInput.trim() || isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
