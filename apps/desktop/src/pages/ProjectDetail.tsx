import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Kanban, GanttChart, List, FolderKanban, Plus, X, CheckSquare, Square, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useProject } from '../hooks/useProjects';
import { ProjectKanban } from '../components/project/ProjectKanban';
import { ProjectGantt } from '../components/project/ProjectGantt';
import { ProjectListView } from '../components/project/ProjectListView';
import { getAllTodos, bulkUpdateTodoProject } from '../db/todos';
import type { Todo } from '../types';

type ViewMode = 'kanban' | 'gantt' | 'list';

const views: { id: ViewMode; label: string; icon: typeof Kanban }[] = [
  { id: 'kanban', label: 'Kanban', icon: Kanban },
  { id: 'gantt', label: 'Gantt', icon: GanttChart },
  { id: 'list', label: 'List', icon: List },
];

function ImportTodosModal({
  projectId,
  projectColor,
  onClose,
  onImported,
}: {
  projectId: string;
  projectColor: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [allTodos, setAllTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    const doFetch = async () => {
      const todos = await getAllTodos();
      const eligible = todos.filter((t) => t.projectId !== projectId);
      setAllTodos(eligible);
      setIsLoading(false);
    };
    doFetch();
  }, [projectId]);

  const filteredTodos = allTodos.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  function toggleSelection(todoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(todoId)) {
        next.delete(todoId);
      } else {
        next.add(todoId);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filteredTodos.map((t) => t.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleAssign() {
    if (selectedIds.size === 0) return;
    setIsAssigning(true);
    await bulkUpdateTodoProject(Array.from(selectedIds), projectId);
    setIsAssigning(false);
    onImported();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Import Todos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select existing todos to add to this project
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search todos..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Select all bar */}
        {filteredTodos.length > 0 && (
          <div className="flex items-center justify-between px-5 py-2 border-b border-slate-100 dark:border-slate-800 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllVisible}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
              >
                Select all
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-slate-400">Loading...</div>
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {search.trim()
                  ? 'No todos match your search'
                  : 'All todos are already in this project'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredTodos.map((todo) => (
                <button
                  key={todo.id}
                  onClick={() => toggleSelection(todo.id)}
                  className={clsx(
                    'w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors',
                    selectedIds.has(todo.id)
                      ? 'bg-indigo-50 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {selectedIds.has(todo.id) ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={clsx(
                        'text-sm font-medium block truncate',
                        todo.status === 'done'
                          ? 'text-slate-400 dark:text-slate-500 line-through'
                          : 'text-slate-900 dark:text-slate-100'
                      )}
                    >
                      {todo.title}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {todo.estimatedMinutes}m
                      </span>
                      <span
                        className={clsx(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded',
                          todo.priority === 'high'
                            ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                            : todo.priority === 'medium'
                            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        )}
                      >
                        {todo.priority}
                      </span>
                      {todo.status === 'done' && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Done
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={selectedIds.size === 0 || isAssigning}
            className={clsx(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors',
              selectedIds.size === 0 || isAssigning
                ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'
                : 'hover:opacity-90'
            )}
            style={
              selectedIds.size > 0 && !isAssigning
                ? { backgroundColor: projectColor }
                : undefined
            }
          >
            {isAssigning
              ? 'Importing...'
              : `Import ${selectedIds.size} todo${selectedIds.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ViewMode>('kanban');
  const [showImport, setShowImport] = useState(false);
  const { project, todos, stats, isLoading, updateTodoStatusLocal, updateTodoLocal, refresh } = useProject(id);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-48" />
        <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-7xl mx-auto text-center py-20">
        <p className="text-slate-500 dark:text-slate-400">Project not found.</p>
        <Link to="/projects" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Link
            to="/projects"
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Projects
          </Link>
        </div>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: project.color + '20' }}
            >
              <FolderKanban className="w-6 h-6" style={{ color: project.color }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{project.title}</h1>
              {project.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Import Todos
            </button>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{progress}%</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {stats.done} of {stats.total} done
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, backgroundColor: project.color }}
          />
        </div>
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-1 mb-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1 w-fit">
        {views.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                view === v.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <Icon className="w-4 h-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* View content */}
      <div className="min-h-[400px]">
        {view === 'kanban' && (
          <ProjectKanban
            projectId={project.id}
            todos={todos}
            projectColor={project.color}
            onUpdateStatus={updateTodoStatusLocal}
            onUpdateTodo={updateTodoLocal}
          />
        )}
        {view === 'gantt' && (
          <ProjectGantt
            project={project}
            todos={todos}
            onUpdateTodo={updateTodoLocal}
          />
        )}
        {view === 'list' && (
          <ProjectListView
            projectId={project.id}
            todos={todos}
            projectColor={project.color}
            onUpdateStatus={updateTodoStatusLocal}
            onUpdateTodo={updateTodoLocal}
          />
        )}
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportTodosModal
          projectId={project.id}
          projectColor={project.color}
          onClose={() => setShowImport(false)}
          onImported={refresh}
        />
      )}
    </div>
  );
}
