import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Link2, Target, ListTodo } from 'lucide-react';
import type { Todo } from '../types';

interface NeighborPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  direction: 'before' | 'after';
  nodeType: 'goal' | 'task';
  candidates: Todo[];
  onCreate: (title: string) => void;
  onLink: (todoId: string) => void;
}

export function NeighborPromptDialog({
  isOpen,
  onClose,
  direction,
  nodeType,
  candidates,
  onCreate,
  onLink,
}: NeighborPromptDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const directionLabel = direction === 'before' ? 'before' : 'after';
  const typeLabel = nodeType === 'goal' ? 'goal' : 'task';
  const TypeIcon = nodeType === 'goal' ? Target : ListTodo;

  useEffect(() => {
    if (isOpen) {
      setSelectedId(candidates.length > 0 ? candidates[0].id : null);
      setNewTitle('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, candidates]);

  const handleSubmit = useCallback(() => {
    const title = newTitle.trim();
    if (title) {
      onCreate(title);
      return;
    }
    if (selectedId) {
      onLink(selectedId);
    }
  }, [newTitle, selectedId, onCreate, onLink]);

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

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] pointer-events-none">
        <div
          className="w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <TypeIcon className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Add {directionLabel}-{typeLabel}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Link an existing {typeLabel} {directionLabel}
                </p>
                <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                  {candidates.map((todo) => (
                    <button
                      key={todo.id}
                      onClick={() => setSelectedId(todo.id)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        selectedId === todo.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {todo.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {candidates.length > 0 ? 'Or create a new one' : `No existing ${typeLabel}s to link. Create a new one`}
              </p>
              <input
                ref={inputRef}
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`New ${typeLabel} title`}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!newTitle.trim() && !selectedId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {newTitle.trim() ? (
                <>
                  <Plus className="w-3 h-3" />
                  Create & link
                </>
              ) : (
                <>
                  <Link2 className="w-3 h-3" />
                  Link selected
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
