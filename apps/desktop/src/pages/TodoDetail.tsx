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
  Activity,
  Pencil,
  Save,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { formatDuration, formatDateShort } from '../utils/date';
import { RoadToGoalGraph } from '../components/RoadToGoalGraph';
import { TraceView } from '../components/TraceView';
import { LabelPicker } from '../components/LabelPicker';
import { useTodoLogs } from '../hooks/useTodoLogs';
import { GoalDetail } from './GoalDetail';
import type { Todo, RepeatRule, Priority, TaskPattern, TodoRelationType } from '../types';
import { dbStore } from '../db/store';
import { createRelation, deleteRelation, getSpawnedTodos, getTemplateForInstance, updateRelation } from '@utral/db-schema/relation-ops';
import { getTodo, traceGoalChain, updateTodo, updateTodoStatus } from '@utral/db-schema/todo-ops';

export function TodoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [todo, setTodo] = useState<Todo | null>(null);
  const [parentGoal, setParentGoal] = useState<Todo | null>(null);
  const [isLoadingTodo, setIsLoadingTodo] = useState(true);

  // Edit mode — default to open for the two-column layout
  const [isEditing, setIsEditing] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editPattern, setEditPattern] = useState<TaskPattern>('task');
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState(60);
  const [editTags, setEditTags] = useState<string[]>([]);
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

  // Repeat
  const [templateTodo, setTemplateTodo] = useState<Todo | null>(null);

  const { logs, isLoading: isLoadingLogs } = useTodoLogs(id ?? '');
  const totalMinutesSpent = logs.reduce((sum, l) => sum + (l.minutesSpent ?? 0), 0);

  const loadTodo = useCallback(async () => {
    if (!id) return;
    setIsLoadingTodo(true);
    const t = await getTodo(dbStore, id);
    if (t) {
      setTodo(t);

      const [spawned, tmpl] = await Promise.all([
        getSpawnedTodos(dbStore, t.id),
        getTemplateForInstance(dbStore, t.id),
      ]);
      setSpawnedTodos(spawned);
      setTemplateTodo(tmpl ?? null);

      const goalChain = await traceGoalChain(dbStore, t.id);
      setParentGoal(goalChain[goalChain.length - 1] ?? null);

    }
    setIsLoadingTodo(false);
  }, [id]);

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
    await updateTodoStatus(dbStore, id, 'done');
    setTodo((prev) =>
      prev
        ? { ...prev, status: 'done', completedAt: new Date() }
        : prev
    );
  }

  async function markUndone() {
    if (!id) return;
    await updateTodoStatus(dbStore, id, 'pending');
    setTodo((prev) =>
      prev ? { ...prev, status: 'pending', completedAt: undefined } : prev
    );
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
    setEditPriority(t.priority ?? 'medium');
    setEditPattern(t.pattern ?? 'task');
    setEditEstimatedMinutes(t.estimatedMinutes ?? 60);
    setEditTags([...t.tags]);
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
    setIsPropertiesOpen(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setIsPropertiesOpen(false);
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
      priority: editPriority,
      pattern: editPattern,
      estimatedMinutes: editEstimatedMinutes,
      tags: editTags,
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

    await updateTodo(dbStore, id, updates);

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
    setIsPropertiesOpen(false);
    setIsSaving(false);
  }

  async function handleCreateRelation(fromTodoId: string, toTodoId: string, type: TodoRelationType) {
    await createRelation(dbStore, fromTodoId, toTodoId, type);
  }

  async function handleDeleteRelation(relationId: string) {
    await deleteRelation(dbStore, relationId);
  }

  async function handleUpdateRelation(relationId: string, type: TodoRelationType) {
    await updateRelation(dbStore, relationId, { type });
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

  // Branch by nodeType
  if (todo.nodeType === 'goal') {
    return (
      <GoalDetail
        goal={todo}
        onUpdate={(updates) => setTodo((prev) => (prev ? { ...prev, ...updates } : prev))}
      />
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
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Est. {formatDuration(todo.estimatedMinutes ?? 60)}
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
            {todo.pattern === 'cognitive' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400">
                Cognitive
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
      {todo && (
        <RoadToGoalGraph
          goalId={parentGoal?.nodeType === 'goal' ? parentGoal.id : todo.id}
          centerTodoId={todo.id}
          highlightTodoId={todo.id}
          mode="card"
          title="Road to Goal"
          editing
          layersAround={3}
          onNodeClick={(todoId) => navigate(`/todo/${todoId}`)}
          onCreateRelation={handleCreateRelation}
          onDeleteRelation={handleDeleteRelation}
          onUpdateRelation={handleUpdateRelation}
        />
      )}

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
                  {(spawned.estimatedMinutes ?? 0) > 0 && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {formatDuration(spawned.estimatedMinutes ?? 60)}
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

      <div className="grid grid-cols-3 gap-4">
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
            Pattern
          </label>
          <select
            value={editPattern}
            onChange={(e) => setEditPattern(e.target.value as TaskPattern)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="task">Task</option>
            <option value="cognitive">Cognitive</option>
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
          Labels
        </label>
        <LabelPicker tags={editTags} onChange={setEditTags} />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <button
            onClick={() => setIsPropertiesOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isPropertiesOpen ? 'Hide properties panel' : 'Show properties panel'}
          >
            {isPropertiesOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
            {isPropertiesOpen ? 'Hide Properties' : 'Show Properties'}
          </button>
          {!isEditing && (
            <button
              onClick={startEditing}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Edit todo"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
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

      {isPropertiesOpen ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Left column — main content */}
          <div className="space-y-6 min-w-0">
            {headerCard}
            {sharedSections}
          </div>
          {/* Right column — sticky properties/edit panel */}
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
