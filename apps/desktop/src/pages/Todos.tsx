import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle2,
  Circle,
  Search,
  ListTodo,
  ArrowRight,
  Calendar,
  AlertCircle,
  X,
  FolderKanban,
  CheckSquare,
  Square,
  GripVertical,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTodos } from '../hooks/useTodos';
import { bulkUpdateTodoProject } from '../db/todos';
import { getAllProjects } from '../db/projects';
import { formatDate, formatDuration, isToday } from '../utils/date';
import type { Todo, TodoStatus, Priority, Project } from '../types';

/* ─── Helpers ─── */

const priorityConfig: Record<
  Priority,
  { label: string; bg: string; text: string; darkBg: string; darkText: string }
> = {
  high: {
    label: 'High',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    darkBg: 'dark:bg-rose-950/30',
    darkText: 'dark:text-rose-400',
  },
  medium: {
    label: 'Med',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    darkBg: 'dark:bg-amber-950/30',
    darkText: 'dark:text-amber-400',
  },
  low: {
    label: 'Low',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    darkBg: 'dark:bg-slate-800',
    darkText: 'dark:text-slate-400',
  },
};

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = priorityConfig[priority];
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} ${cfg.darkBg} ${cfg.darkText}`}
    >
      {cfg.label}
    </span>
  );
}

function ProjectBadge({ project }: { project: Project }) {
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: project.color + '20',
        color: project.color,
      }}
    >
      {project.title}
    </span>
  );
}

type FilterTab = 'all' | 'in_progress' | 'pending' | 'done';

/* ─── Sortable Todo Row ─── */

function SortableTodoRow({
  todo,
  onToggle,
  onOpen,
  selectMode,
  selected,
  onSelectToggle,
  projects,
  isDragEnabled,
}: {
  todo: Todo;
  onToggle: (id: string, status: TodoStatus) => void;
  onOpen: (id: string) => void;
  selectMode: boolean;
  selected: boolean;
  onSelectToggle: (id: string) => void;
  projects: Project[];
  isDragEnabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id, disabled: !isDragEnabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isDone = todo.status === 'done';
  const isInProgress = todo.status === 'in_progress';
  const project = todo.projectId
    ? projects.find((p) => p.id === todo.projectId)
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group ${
        isDragging ? 'bg-indigo-50 dark:bg-indigo-950/20 z-50' : ''
      } ${todo.isGoal ? 'border-l-2 border-l-amber-400 dark:border-l-amber-500' : ''}`}
    >
      {/* Drag handle */}
      {isDragEnabled && !selectMode && (
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}

      {/* Selection checkbox */}
      {selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectToggle(todo.id);
          }}
          className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400"
        >
          {selected ? (
            <CheckSquare className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
          )}
        </button>
      )}

      {/* Status toggle (hidden in select mode) */}
      {!selectMode && (
        <button
          onClick={() => onToggle(todo.id, todo.status)}
          className="mt-0.5 shrink-0"
        >
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : isInProgress ? (
            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            </div>
          ) : (
            <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors" />
          )}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <button
          onClick={() => onOpen(todo.id)}
          className={`text-sm font-medium text-left truncate block w-full ${
            isDone
              ? 'text-slate-400 dark:text-slate-500 line-through'
              : 'text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors'
          }`}
        >
          {todo.title}
        </button>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {todo.scheduledDate && (
            <span
              className={`flex items-center gap-1 text-[11px] ${
                isToday(todo.scheduledDate)
                  ? 'text-indigo-500 dark:text-indigo-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {isToday(todo.scheduledDate)
                ? 'Today'
                : formatDate(todo.scheduledDate)}
            </span>
          )}
          {todo.dueDate && (
            <span
              className={`flex items-center gap-1 text-[11px] ${
                new Date(todo.dueDate) < new Date() && !isDone
                  ? 'text-rose-500 dark:text-rose-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <AlertCircle className="w-3 h-3" />
              {formatDate(todo.dueDate)}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatDuration(todo.estimatedMinutes)}
          </span>
          <PriorityBadge priority={todo.priority} />
          {todo.isGoal && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
              Goal
            </span>
          )}
          {project && <ProjectBadge project={project} />}
          {todo.tags.length > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {todo.tags.join(', ')}
            </span>
          )}
        </div>
      </div>

      {!selectMode && (
        <button
          onClick={() => onOpen(todo.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 dark:text-slate-600 hover:text-indigo-500"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ─── Main Page ─── */

export function Todos() {
  const navigate = useNavigate();
  const { todos, isLoading, setStatus, reorder, refresh, remove } = useTodos();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const isDragEnabled = activeTab === 'all' && !search.trim();

  const filteredTodos = useMemo(() => {
    let result = todos;

    if (activeTab !== 'all') {
      result = result.filter((t) => t.status === activeTab);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    // Todos are already sorted by order from the server
    return result;
  }, [todos, activeTab, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filteredTodos.length / itemsPerPage));
  const paginatedTodos = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTodos.slice(start, start + itemsPerPage);
  }, [filteredTodos, currentPage]);

  const counts = useMemo(() => {
    const all = todos.length;
    const inProgress = todos.filter((t) => t.status === 'in_progress').length;
    const pending = todos.filter((t) => t.status === 'pending').length;
    const done = todos.filter((t) => t.status === 'done').length;
    return { all, inProgress, pending, done };
  }, [todos]);

  async function toggleTodo(todoId: string, currentStatus: TodoStatus) {
    const newStatus: TodoStatus =
      currentStatus === 'done' ? 'pending' : currentStatus === 'in_progress' ? 'done' : 'in_progress';
    await setStatus(todoId, newStatus);
  }

  function openTodo(todoId: string) {
    navigate(`/todo/${todoId}`);
  }

  function toggleSelectMode() {
    if (selectMode) {
      setSelectMode(false);
      setSelectedIds(new Set());
      setShowProjectDropdown(false);
    } else {
      setSelectMode(true);
      getAllProjects().then(setAllProjects);
    }
  }

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
    setSelectedIds(new Set(paginatedTodos.map((t) => t.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function assignToProject(projectId: string | undefined) {
    if (selectedIds.size === 0) return;
    setIsAssigning(true);
    await bulkUpdateTodoProject(Array.from(selectedIds), projectId);
    await refresh();
    setSelectedIds(new Set());
    setShowProjectDropdown(false);
    setIsAssigning(false);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todos.findIndex((t) => t.id === active.id);
    const newIndex = todos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(todos, oldIndex, newIndex);
    const orderedIds = reordered.map((t) => t.id);

    await reorder(orderedIds);
  }

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'in_progress', label: 'In Progress', count: counts.inProgress },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'done', label: 'Done', count: counts.done },
  ];

  if (isLoading) {
    return (
      <div className="text-slate-500 dark:text-slate-400">Loading...</div>
    );
  }

  return (
    <div className="space-y-5 w-full">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Todos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {counts.pending + counts.inProgress} active &middot; {counts.done} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectMode}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectMode
                ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {selectMode ? (
              <>
                <X className="w-4 h-4" />
                Done
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4" />
                Select
              </>
            )}
          </button>
          <button
            onClick={() => navigate('/todo/new')}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <ListTodo className="w-4 h-4" />
            New Todo
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search todos..."
          className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key
                  ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab.count}
            </span>
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Select-all bar (in select mode) */}
      {selectMode && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllVisible}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
            >
              Select all visible
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

      {/* Todo List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
        {filteredTodos.length === 0 ? (
          <div className="text-center py-12">
            <ListTodo className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
              {search
                ? 'No todos match your search'
                : activeTab === 'all'
                ? 'No todos yet'
                : `No ${activeTab.replace('_', ' ')} todos`}
            </p>
            {!search && activeTab !== 'done' && (
              <button
                onClick={() => navigate('/todo/new')}
                className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
              >
                Create your first todo
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={paginatedTodos.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-slate-100 dark:divide-slate-800 px-3">
                {paginatedTodos.map((todo) => (
                  <SortableTodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onOpen={openTodo}
                    selectMode={selectMode}
                    selected={selectedIds.has(todo.id)}
                    onSelectToggle={toggleSelection}
                    projects={allProjects}
                    isDragEnabled={isDragEnabled}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredTodos.length)} of {filteredTodos.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-4 py-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {selectedIds.size} selected
            </span>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

            {/* Project dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProjectDropdown((v) => !v)}
                disabled={isAssigning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
              >
                <FolderKanban className="w-4 h-4" />
                Assign to project
              </button>

              {showProjectDropdown && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProjectDropdown(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                    <button
                      onClick={() => assignToProject(undefined)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      No project
                    </button>
                    {allProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => assignToProject(project.id)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="truncate">{project.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={async () => {
                const ids = Array.from(selectedIds);
                for (const id of ids) {
                  await remove(id);
                }
                setSelectedIds(new Set());
                setShowProjectDropdown(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>

            <button
              onClick={() => {
                setSelectedIds(new Set());
                setShowProjectDropdown(false);
              }}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
