import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, Pencil, Trash2, X, Check } from 'lucide-react';
import { getAllLabels, renameLabel, deleteLabel } from '../db/labels';
import type { Label } from '../types';

export function Labels() {
  const navigate = useNavigate();
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadLabels();
  }, []);

  async function loadLabels() {
    setIsLoading(true);
    const data = await getAllLabels();
    setLabels(data);
    setIsLoading(false);
  }

  async function handleRename(oldName: string) {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingName(null);
      return;
    }

    await renameLabel(oldName, trimmed);
    setEditingName(null);
    await loadLabels();
  }

  async function handleDelete(name: string) {
    await deleteLabel(name);
    await loadLabels();
  }

  const filtered = labels.filter((l) =>
    l.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <Tag className="w-6 h-6 text-indigo-500" />
        Labels
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">
        Manage labels used across your tasks and goals
      </p>

      <div className="mt-6">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter labels..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
            Loading...
          </p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {labels.length === 0
                ? 'No labels yet. Add labels to your tasks and goals to see them here.'
                : 'No labels match your filter.'}
            </p>
          </div>
        ) : (
          filtered.map((label) => (
            <div
              key={label.name}
              className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            >
              <Tag className="w-4 h-4 text-indigo-500 shrink-0" />

              {editingName === label.name ? (
                <>
                  <input
                    type="text"
                    placeholder="Label name"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(label.name);
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => handleRename(label.name)}
                    className="p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingName(null)}
                    className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {label.name}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {label.count} {label.count === 1 ? 'task' : 'tasks'}
                  </span>
                  <button
                    onClick={() => {
                      setEditingName(label.name);
                      setEditValue(label.name);
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Rename label"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove label "${label.name}" from all tasks?`)) {
                        handleDelete(label.name);
                      }
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    title="Delete label"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
