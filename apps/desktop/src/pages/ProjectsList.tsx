import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderKanban, Calendar, CheckCircle2, Clock, Circle, Archive, Trash2, Edit2, X, ArrowUpDown, Search, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useProjects } from '../hooks/useProjects';
import { getProjectStats } from '../db/projects';
import type { Project } from '../types';

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
];

type FilterTab = 'all' | 'active' | 'archived';
type SortKey = 'title' | 'deadline' | 'createdAt' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export function ProjectsList() {
  const { projects, isLoading, add, update, remove } = useProjects();
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [formDeadline, setFormDeadline] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormColor(PRESET_COLORS[0]);
    setFormDeadline('');
    setEditingProject(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingProject) {
      await update(editingProject.id, {
        title: formTitle.trim(),
        description: formDescription.trim(),
        color: formColor,
        deadline: formDeadline ? new Date(formDeadline) : undefined,
      });
    } else {
      await add(formTitle.trim(), {
        description: formDescription.trim(),
        color: formColor,
        deadline: formDeadline ? new Date(formDeadline) : undefined,
      });
    }
    resetForm();
    setShowForm(false);
  };

  const filteredProjects = useMemo(() => {
    let result = projects;
    if (filter !== 'all') {
      result = result.filter((p) => p.status === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortKey === 'deadline') {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        cmp = da - db;
      } else if (sortKey === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [projects, filter, search, sortKey, sortDir]);

  const counts = useMemo(() => {
    return {
      all: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      archived: projects.filter((p) => p.status === 'archived').length,
    };
  }, [projects]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setShowSortDropdown(false);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormTitle(project.title);
    setFormDescription(project.description);
    setFormColor(project.color);
    setFormDeadline(project.deadline ? formatDateInput(project.deadline) : '');
    setShowForm(true);
  };

  const handleArchive = async (project: Project) => {
    await update(project.id, { status: project.status === 'active' ? 'archived' : 'active' });
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Projects</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {projects.length > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1 w-fit">
            {([
              { key: 'all' as FilterTab, label: 'All' },
              { key: 'active' as FilterTab, label: 'Active' },
              { key: 'archived' as FilterTab, label: 'Archived' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2',
                  filter === tab.key
                    ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                {tab.label}
                <span
                  className={clsx(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    filter === tab.key
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  )}
                >
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortDropdown((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="capitalize">{sortKey}</span>
              <span className="text-xs text-slate-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showSortDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSortDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  {([
                    { key: 'updatedAt' as SortKey, label: 'Last updated' },
                    { key: 'createdAt' as SortKey, label: 'Created' },
                    { key: 'title' as SortKey, label: 'Title' },
                    { key: 'deadline' as SortKey, label: 'Deadline' },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleSort(opt.key)}
                      className={clsx(
                        'w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                        sortKey === opt.key
                          ? 'text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20'
                          : 'text-slate-700 dark:text-slate-300'
                      )}
                    >
                      {opt.label}
                      {sortKey === opt.key && (
                        <span className="text-xs text-slate-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingProject ? 'Edit Project' : 'New Project'}
            </h2>
            <button
              onClick={() => { resetForm(); setShowForm(false); }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Project name"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={clsx(
                        'w-7 h-7 rounded-full border-2 transition-all',
                        formColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Deadline</label>
                <input
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { resetForm(); setShowForm(false); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!formTitle.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {editingProject ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <FolderKanban className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-2">No projects yet.</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Create a project to organize your todos with Kanban, Gantt, and List views.
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Search className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-1">No projects match your filters.</p>
          <button
            onClick={() => { setFilter('all'); setSearch(''); }}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEdit}
              onArchive={handleArchive}
              onDelete={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onArchive,
  onDelete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onArchive: (p: Project) => void;
  onDelete: (id: string) => void;
}) {
  const [stats, setStats] = useState({ total: 0, done: 0, inProgress: 0, pending: 0 });

  useEffect(() => {
    let cancelled = false;
    getProjectStats(project.id).then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => { cancelled = true; };
  }, [project.id]);

  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: project.color + '20' }}
            >
              <FolderKanban className="w-5 h-5" style={{ color: project.color }} />
            </div>
            <div>
              <Link
                to={`/project/${project.id}`}
                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {project.title}
              </Link>
              {project.status === 'archived' && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                  Archived
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(project)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onArchive(project)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={project.status === 'active' ? 'Archive' : 'Unarchive'}
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm('Delete this project? Todos will be unassigned but not deleted.')) {
                  onDelete(project.id);
                }
              }}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {project.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
            {project.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-3">
          {project.deadline && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(project.deadline).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {stats.done}/{stats.total} done
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              backgroundColor: project.color,
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Circle className="w-3 h-3" /> {stats.pending}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {stats.inProgress}
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {stats.done}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatDateInput(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
