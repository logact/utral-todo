import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  GitBranch,
  CornerDownRight,
  Repeat,
  Play,
  Target,
  Activity,
  Pencil,
  X,
  Save,
} from 'lucide-react';
import { getTodo, updateTodo, updateTodoStatus } from '../db/todos';
import { getSpawnedTodos, getTemplateForInstance } from '../db/relations';
import { getAllProjects } from '../db/projects';
import { formatDuration, formatDateShort, formatTime } from '../utils/date';
import { BranchView } from '../components/BranchView';
import { TraceView } from '../components/TraceView';
import { JourneyPath } from '../components/JourneyPath';
import { useTodoLogs } from '../hooks/useTodoLogs';
import { getAllActionEdgesForTodo, createActionEdge, deleteActionEdge } from '../db/actionEdges';
import type { Todo, RepeatRule, ActionEdge, Priority, Project } from '../types';

function ProjectBadge({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAllProjects().then((projects) => {
      const p = projects.find((pr) => pr.id === projectId);
      if (p) setProject(p);
    });
  }, [projectId]);

  if (!project) return null;

  return (
    <button
      onClick={() => navigate(`/project/${project.id}`)}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: project.color + '20',
        color: project.color,
      }}
    >
      {project.title}
    </button>
  );
}

function findUltimateGoalId(startId: string, edges: ActionEdge[]): string {
  const outgoingMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoingMap.has(e.fromTodoId)) outgoingMap.set(e.fromTodoId, []);
    outgoingMap.get(e.fromTodoId)!.push(e.toTodoId);
  }
  let current = startId;
  const visited = new Set<string>();
  while (visited.size < edges.length + 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const parents = outgoingMap.get(current);
    if (!parents || parents.length === 0) break;
    current = parents[0];
  }
  return current;
}

export function TodoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [todo, setTodo] = useState<Todo | null>(null);
  const [isLoadingTodo, setIsLoadingTodo] = useState(true);

  // Edit mode — default to open for the two-column layout
  const [isEditing, setIsEditing] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState(60);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editScheduledDate, setEditScheduledDate] = useState('');
  const [editScheduledTime, setEditScheduledTime] = useState('');
  const [editScheduledEndDate, setEditScheduledEndDate] = useState('');
  const [editScheduledEndTime, setEditScheduledEndTime] = useState('');
  const [editHasRepeat, setEditHasRepeat] = useState(false);
  const [editRepeatType, setEditRepeatType] = useState<'daily' | 'weekly' | 'every_n_days'>('weekly');
  const [editRepeatWeekDays, setEditRepeatWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [editRepeatInterval, setEditRepeatInterval] = useState(2);
  const [editRepeatEndDate, setEditRepeatEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Track whether edit form has been initialized from loaded todo data
  const editFormInitRef = useRef(false);

  const [spawnedTodos, setSpawnedTodos] = useState<Todo[]>([]);
  const [actionEdges, setActionEdges] = useState<ActionEdge[]>([]);
  const [goalTodo, setGoalTodo] = useState<Todo | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);

  // Repeat
  const [templateTodo, setTemplateTodo] = useState<Todo | null>(null);

  const { logs, isLoading: isLoadingLogs } = useTodoLogs(id ?? '');
  const totalMinutesSpent = logs.reduce((sum, l) => sum + (l.minutesSpent ?? 0), 0);

  const loadActionEdges = useCallback(async (todoId: string) => {
    const edges = await getAllActionEdgesForTodo(todoId);
    setActionEdges(edges);
    const goalId = findUltimateGoalId(todoId, edges);
    if (goalId !== todoId) {
      const g = await getTodo(goalId);
      setGoalTodo(g ?? null);
    } else {
      const current = await getTodo(todoId);
      setGoalTodo(current ?? null);
    }
  }, []);

  const loadTodo = useCallback(async () => {
    if (!id) return;
    setIsLoadingTodo(true);
    const t = await getTodo(id);
    if (t) {
      setTodo(t);

      const [spawned, tmpl, projects] = await Promise.all([
        getSpawnedTodos(t.id),
        getTemplateForInstance(t.id),
        getAllProjects(),
      ]);
      setSpawnedTodos(spawned);
      setTemplateTodo(tmpl ?? null);
      setAllProjects(projects);

      await loadActionEdges(t.id);
    }
    setIsLoadingTodo(false);
  }, [id, loadActionEdges]);

  const handleCreateEdge = useCallback(async (fromTodoId: string, toTodoId: string, type: 'insight' | 'try' | 'pre_do') => {
    await createActionEdge(fromTodoId, toTodoId, type);
    if (id) await loadActionEdges(id);
  }, [id, loadActionEdges]);

  const handleDeleteEdge = useCallback(async (edgeId: string) => {
    await deleteActionEdge(edgeId);
    if (id) await loadActionEdges(id);
  }, [id, loadActionEdges]);

  const handleEdgesChange = useCallback(async () => {
    if (id) await loadActionEdges(id);
  }, [id, loadActionEdges]);

  useEffect(() => {
    loadTodo();
  }, [loadTodo]);

  // Initialize edit form once when todo loads (panel is open by default)
  useEffect(() => {
    if (todo && !editFormInitRef.current && !isLoadingTodo) {
      initEditForm(todo);
      editFormInitRef.current = true;
    }
  }, [todo, isLoadingTodo]);

  async function markDone() {
    if (!id) return;
    await updateTodoStatus(id, 'done');
    setTodo((prev) =>
      prev
        ? { ...prev, status: 'done', completedAt: new Date() }
        : prev
    );
  }

  async function markUndone() {
    if (!id) return;
    await updateTodoStatus(id, 'pending');
    setTodo((prev) =>
      prev ? { ...prev, status: 'pending', completedAt: undefined } : prev
    );
  }

  async function toggleGoal() {
    if (!id || !todo) return;
    const newVal = !todo.isGoal;
    await updateTodo(id, { isGoal: newVal });
    setTodo((prev) => (prev ? { ...prev, isGoal: newVal } : prev));
  }

  function formatRepeatRule(rule: RepeatRule): string {
    if (rule.type === 'daily') return 'Every day';
    if (rule.type === 'weekly' && rule.weekDays) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `Every week on ${rule.weekDays.map((d) => days[d]).join(', ')}`;
    }
    if (rule.type === 'every_n_days' && rule.interval) {
      return `Every ${rule.interval} days`;
    }
    return 'Repeating';
  }

  function initEditForm(t: Todo) {
    setEditTitle(t.title);
    setEditDescription(t.description);
    setEditInstructions(t.instructions);
    setEditPriority(t.priority);
    setEditEstimatedMinutes(t.estimatedMinutes);
    setEditTags([...t.tags]);
    setEditTagInput('');
    setEditProjectId(t.projectId ?? '');
    setEditDueDate(t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : '');
    setEditScheduledDate(t.scheduledDate ? new Date(t.scheduledDate).toISOString().split('T')[0] : '');
    setEditScheduledTime(t.scheduledDate ? new Date(t.scheduledDate).toTimeString().slice(0, 5) : '');
    setEditScheduledEndDate(t.scheduledEndDate ? new Date(t.scheduledEndDate).toISOString().split('T')[0] : '');
    setEditScheduledEndTime(t.scheduledEndDate ? new Date(t.scheduledEndDate).toTimeString().slice(0, 5) : '');
    if (t.repeatRule) {
      setEditHasRepeat(true);
      setEditRepeatType(t.repeatRule.type);
      setEditRepeatWeekDays(t.repeatRule.weekDays ?? [1, 2, 3, 4, 5]);
      setEditRepeatInterval(t.repeatRule.interval ?? 2);
      setEditRepeatEndDate(t.repeatRule.endDate ? new Date(t.repeatRule.endDate).toISOString().split('T')[0] : '');
    } else {
      setEditHasRepeat(false);
      setEditRepeatType('weekly');
      setEditRepeatWeekDays([1, 2, 3, 4, 5]);
      setEditRepeatInterval(2);
      setEditRepeatEndDate('');
    }
  }

  function startEditing() {
    if (!todo) return;
    editFormInitRef.current = false;
    initEditForm(todo);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
  }

  async function saveEdits() {
    if (!id || !todo) return;
    setIsSaving(true);

    let repeatRule: RepeatRule | undefined;
    if (editHasRepeat) {
      repeatRule = { type: editRepeatType };
      if (editRepeatType === 'weekly') {
        repeatRule.weekDays = editRepeatWeekDays;
      } else if (editRepeatType === 'every_n_days') {
        repeatRule.interval = editRepeatInterval;
      }
      if (editRepeatEndDate) {
        repeatRule.endDate = new Date(editRepeatEndDate);
      }
    }

    const updates: Partial<Todo> = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      instructions: editInstructions.trim(),
      priority: editPriority,
      estimatedMinutes: editEstimatedMinutes,
      tags: editTags,
      projectId: editProjectId || undefined,
      dueDate: editDueDate ? new Date(editDueDate) : undefined,
      scheduledDate: (() => {
        if (!editScheduledDate) return undefined;
        const date = new Date(editScheduledDate);
        if (editScheduledTime) {
          const [h, m] = editScheduledTime.split(':').map(Number);
          date.setHours(h, m, 0, 0);
        }
        return date;
      })(),
      scheduledEndDate: (() => {
        if (!editScheduledEndDate) return undefined;
        const date = new Date(editScheduledEndDate);
        if (editScheduledEndTime) {
          const [h, m] = editScheduledEndTime.split(':').map(Number);
          date.setHours(h, m, 0, 0);
        }
        return date;
      })(),
      repeatRule,
    };

    await updateTodo(id, updates);

    setTodo((prev) =>
      prev
        ? {
            ...prev,
            ...updates,
            dueDate: updates.dueDate,
            scheduledDate: updates.scheduledDate,
            scheduledEndDate: updates.scheduledEndDate,
            repeatRule: updates.repeatRule,
          }
        : prev
    );

    setIsEditing(false);
    setIsSaving(false);
  }

  function handleEditTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEditTag();
    }
    if (e.key === 'Backspace' && !editTagInput && editTags.length > 0) {
      setEditTags((prev) => prev.slice(0, -1));
    }
  }

  function addEditTag() {
    const raw = editTagInput.trim();
    if (!raw) return;
    const newTags = raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    const combined = [...editTags];
    for (const t of newTags) {
      if (!combined.includes(t)) combined.push(t);
    }
    setEditTags(combined);
    setEditTagInput('');
  }

  function removeEditTag(tag: string) {
    setEditTags((prev) => prev.filter((t) => t !== tag));
  }

  if (isLoadingTodo) {
    return (
      <div className="text-slate-500 dark:text-slate-400">Loading...</div>
    );
  }

  if (!todo) {
    return (
      <div className="text-slate-500 dark:text-slate-400">
        Todo not found.
        <button
          onClick={() => navigate(-1)}
          className="ml-2 text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const isDone = todo.status === 'done';

  const headerCard = (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border p-6 transition-all ${
        isDone
          ? 'border-slate-100 dark:border-slate-800 opacity-70'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <button onClick={isDone ? markUndone : markDone} className="mt-0.5 shrink-0">
          {isDone ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <h1
            className={`text-xl font-semibold ${
              isDone
                ? 'text-slate-400 dark:text-slate-500 line-through'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {todo.title}
          </h1>
          {todo.description && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Description
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {todo.description}
              </p>
            </div>
          )}
          {todo.instructions && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                How to do this
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                {todo.instructions}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Est. {formatDuration(todo.estimatedMinutes)}
              {totalMinutesSpent > 0 && (
                <span className="text-slate-400 dark:text-slate-500">
                  {' '}· Logged {formatDuration(totalMinutesSpent)}
                </span>
              )}
            </span>
            {todo.priority === 'high' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <Flag className="w-3 h-3" />
                High
              </span>
            )}
            {todo.priority === 'medium' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                Medium
              </span>
            )}
            {todo.priority === 'low' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                Low
              </span>
            )}
            {todo.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
              >
                {tag}
              </span>
            ))}
            {todo.projectId && (
              <ProjectBadge projectId={todo.projectId} />
            )}
            {todo.dueDate && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Due {formatDateShort(todo.dueDate)}
              </span>
            )}
            {(todo.scheduledDate || todo.scheduledEndDate) && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {todo.scheduledDate && formatDateShort(todo.scheduledDate)}
                {todo.scheduledDate && todo.scheduledEndDate && ' — '}
                {todo.scheduledEndDate && formatDateShort(todo.scheduledEndDate)}
              </span>
            )}
            {todo.repeatRule && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400">
                <Repeat className="w-3 h-3" />
                {formatRepeatRule(todo.repeatRule)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const sharedSections = (
    <>
      {/* Road to Goal */}
      {goalTodo && (
        <JourneyPath
          goalTodo={goalTodo}
          highlightTodoId={todo.id}
          edges={actionEdges}
          onNodeClick={(todoId) => navigate(`/todo/${todoId}`)}
          onCreateEdge={handleCreateEdge}
          onDeleteEdge={handleDeleteEdge}
          onEdgesChange={handleEdgesChange}
        />
      )}

      {/* Goal Tree */}
      <BranchView currentTodoId={todo.id} />

      {/* Execution Trace */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Execution Trace
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
            {logs.length} entries
          </span>
        </div>
        {isLoadingLogs ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
            Loading...
          </p>
        ) : (
          <TraceView logs={logs} />
        )}
      </div>

      {/* Repeat Rule */}
      {todo.repeatRule && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-violet-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Repeating
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatRepeatRule(todo.repeatRule)}
                {todo.repeatRule.endDate && (
                  <> &middot; Ends {formatDateShort(todo.repeatRule.endDate)}</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Spawned Tasks */}
      {spawnedTodos.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Spawned Tasks
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
              {spawnedTodos.filter((s) => s.status === 'done').length} of {spawnedTodos.length} done
            </span>
          </div>
          <div className="space-y-2">
            {spawnedTodos.map((spawned) => {
              const spawnedDone = spawned.status === 'done';
              return (
                <div
                  key={spawned.id}
                  onClick={() => navigate(`/todo/${spawned.id}`)}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                    spawnedDone
                      ? 'bg-slate-50 dark:bg-slate-800/50 border-transparent opacity-60'
                      : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800'
                  }`}
                >
                  <CornerDownRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span
                    className={`text-sm flex-1 ${
                      spawnedDone
                        ? 'text-slate-400 dark:text-slate-500 line-through'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {spawned.title}
                  </span>
                  {spawned.estimatedMinutes > 0 && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {formatDuration(spawned.estimatedMinutes)}
                    </span>
                  )}
                  {spawned.status === 'in_progress' && (
                    <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                      In Progress
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  const editPanel = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6 space-y-5 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Title
        </label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Description
        </label>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={3}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Instructions
        </label>
        <textarea
          value={editInstructions}
          onChange={(e) => setEditInstructions(e.target.value)}
          placeholder="Step-by-step instructions..."
          rows={3}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Priority
          </label>
          <select
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value as Priority)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Est. Time (min)
          </label>
          <input
            type="number"
            value={editEstimatedMinutes}
            onChange={(e) => setEditEstimatedMinutes(parseInt(e.target.value) || 0)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          Tags
        </label>
        <div className="w-full min-h-[2.75rem] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex flex-wrap items-center gap-1.5">
          {editTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
            >
              {tag}
              <button type="button" onClick={() => removeEditTag(tag)} className="hover:text-indigo-900 dark:hover:text-indigo-200">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={editTagInput}
            onChange={(e) => setEditTagInput(e.target.value)}
            onKeyDown={handleEditTagKeyDown}
            onBlur={addEditTag}
            placeholder={editTags.length === 0 ? 'Type and press Enter...' : ''}
            className="flex-1 min-w-[100px] text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Press Enter or comma to add a tag
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Project
          </label>
          <select
            value={editProjectId}
            onChange={(e) => setEditProjectId(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">No project</option>
            {allProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Due Date
          </label>
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Scheduled Start
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={editScheduledDate}
              onChange={(e) => setEditScheduledDate(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="time"
              value={editScheduledTime}
              onChange={(e) => setEditScheduledTime(e.target.value)}
              disabled={!editScheduledDate}
              className="w-[100px] px-2 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Scheduled End
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={editScheduledEndDate}
              onChange={(e) => setEditScheduledEndDate(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="time"
              value={editScheduledEndTime}
              onChange={(e) => setEditScheduledEndTime(e.target.value)}
              disabled={!editScheduledEndDate}
              className="w-[100px] px-2 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Repeat */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={editHasRepeat}
            onChange={(e) => setEditHasRepeat(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Repeat className="w-4 h-4" />
            Recurring todo
          </span>
        </label>
        {editHasRepeat && (
          <div className="mt-4 space-y-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Repeat pattern
              </label>
              <select
                value={editRepeatType}
                onChange={(e) => setEditRepeatType(e.target.value as 'daily' | 'weekly' | 'every_n_days')}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week on selected days</option>
                <option value="every_n_days">Every N days</option>
              </select>
            </div>
            {editRepeatType === 'weekly' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Days of the week
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { label: 'Sun', value: 0 },
                    { label: 'Mon', value: 1 },
                    { label: 'Tue', value: 2 },
                    { label: 'Wed', value: 3 },
                    { label: 'Thu', value: 4 },
                    { label: 'Fri', value: 5 },
                    { label: 'Sat', value: 6 },
                  ].map((day) => {
                    const isSelected = editRepeatWeekDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditRepeatWeekDays((prev) => prev.filter((d) => d !== day.value));
                          } else {
                            setEditRepeatWeekDays((prev) => [...prev, day.value].sort());
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {editRepeatType === 'every_n_days' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Repeat every
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={editRepeatInterval}
                    onChange={(e) => setEditRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">days</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                End date (optional)
              </label>
              <input
                type="date"
                value={editRepeatEndDate}
                onChange={(e) => setEditRepeatEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Goal toggle */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={todo.isGoal}
            onChange={toggleGoal}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Target className="w-4 h-4" />
            This is a goal
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={cancelEditing}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={saveEdits}
          disabled={!editTitle.trim() || isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Edit todo"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={toggleGoal}
                className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  todo.isGoal
                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={todo.isGoal ? 'This is a goal' : 'Set as goal'}
              >
                <Target className="w-4 h-4" />
                {todo.isGoal ? 'Goal' : 'Set Goal'}
              </button>
            </>
          )}
          {isDone && (
            <button
              onClick={markUndone}
              className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <Circle className="w-4 h-4" />
              Mark as pending
            </button>
          )}
          {!isDone && (
            <button
              onClick={() => navigate(`/todo/${todo.id}/execute`)}
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          )}
        </div>
      </div>

      {/* Template breadcrumb (for instances) */}
      {templateTodo && (
        <div className="flex items-center gap-2 text-xs">
          <Repeat className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-slate-400 dark:text-slate-500">Instance of:</span>
          <button
            onClick={() => navigate(`/todo/${templateTodo.id}`)}
            className="text-violet-600 dark:text-violet-400 hover:underline truncate max-w-[200px] font-medium"
          >
            {templateTodo.title}
          </button>
        </div>
      )}

      {isEditing ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Left column — main content */}
          <div className="space-y-6 min-w-0">
            {headerCard}
            {sharedSections}
          </div>
          {/* Right column — sticky edit panel */}
          <div className="lg:sticky lg:top-4">
            {editPanel}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {headerCard}
          {sharedSections}
        </div>
      )}
    </div>
  );
}
