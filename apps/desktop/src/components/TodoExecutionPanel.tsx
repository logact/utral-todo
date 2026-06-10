import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  GitBranch,
  CornerDownRight,
  X,
  Repeat,
  NotebookPen,
  ChevronDown,
  ChevronRight,
  Target,
} from 'lucide-react';
import { getTodo, updateTodo, updateTodoStatus, getSubTodos, updateRepeatRule, createTodo, deleteTodo } from '../db/todos';
import { traceSourceChain, getSpawnedTodos, getTemplateForInstance } from '../db/relations';
import { useTodoLogs } from '../hooks/useTodoLogs';
import {
  getAllActionEdgesForTodo,
  createActionEdge,
  deleteActionEdge,
} from '../db/actionEdges';
import { formatDuration, formatTime, formatDateShort } from '../utils/date';
import { BranchView } from './BranchView';
import { JourneyPath } from './JourneyPath';
import { GoalPath } from './GoalPath';
import { UnifiedLogSection } from './UnifiedLogSection';
import type { Todo, RepeatRule, ActionEdge, ActionEdgeType, TodoStatus } from '../types';

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

export function TodoExecutionPanel({
  todoId,
  onNavigate,
  showBreadcrumbs = true,
  autoStart = false,
  todayTodos,
  onSwitchTodo,
  onNodeClick,
}: {
  todoId: string;
  onNavigate?: (path: string) => void;
  showBreadcrumbs?: boolean;
  autoStart?: boolean;
  todayTodos?: Todo[];
  onSwitchTodo?: (todoId: string) => void;
  onNodeClick?: (todoId: string) => void;
}) {
  const [todo, setTodo] = useState<Todo | null>(null);
  const [subTodos, setSubTodos] = useState<Todo[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [isLoadingTodo, setIsLoadingTodo] = useState(true);

  const [sourceChain, setSourceChain] = useState<Todo[]>([]);
  const [spawnedTodos, setSpawnedTodos] = useState<Todo[]>([]);
  const [actionEdges, setActionEdges] = useState<ActionEdge[]>([]);
  const [goalTodo, setGoalTodo] = useState<Todo | null>(null);
  const [graphNodes, setGraphNodes] = useState<Todo[]>([]);

  const [templateTodo, setTemplateTodo] = useState<Todo | null>(null);
  const [showRepeatForm, setShowRepeatForm] = useState(false);
  const [repeatType, setRepeatType] = useState<'daily' | 'weekly' | 'every_n_days'>('weekly');
  const [repeatWeekDays, setRepeatWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [repeatInterval, setRepeatInterval] = useState(2);
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [isUpdatingRepeat, setIsUpdatingRepeat] = useState(false);

  const { logs, isLoading: isLoadingLogs, add: addLog, remove: removeLog } = useTodoLogs(todoId);

  const totalMinutesSpent = logs.reduce((sum, l) => sum + (l.minutesSpent ?? 0), 0);

  const loadTodo = useCallback(async () => {
    setIsLoadingTodo(true);
    const t = await getTodo(todoId);
    if (t) {
      setTodo(t);
      const subs = await getSubTodos(t.id);
      setSubTodos(subs);

      const [chain, spawned, tmpl] = await Promise.all([
        traceSourceChain(t.id),
        getSpawnedTodos(t.id),
        getTemplateForInstance(t.id),
      ]);
      setSourceChain(chain);
      setSpawnedTodos(spawned);
      setTemplateTodo(tmpl ?? null);

      const edges = await getAllActionEdgesForTodo(t.id);
      setActionEdges(edges);

      const goalId = findUltimateGoalId(t.id, edges);
      if (goalId !== t.id) {
        const g = await getTodo(goalId);
        setGoalTodo(g ?? t);
      } else {
        setGoalTodo(t);
      }

      // Load graph nodes
      await loadGraphNodes(edges, goalId);
    }
    setIsLoadingTodo(false);
  }, [todoId]);

  async function loadGraphNodes(edges?: ActionEdge[], goalId?: string) {
    const useEdges = edges ?? actionEdges;
    const useGoalId = goalId ?? goalTodo?.id ?? todoId;
    if (!useGoalId) {
      setGraphNodes([]);
      return;
    }
    const connectedIds = new Set<string>([useGoalId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of useEdges) {
        if (connectedIds.has(edge.fromTodoId) && !connectedIds.has(edge.toTodoId)) {
          connectedIds.add(edge.toTodoId);
          changed = true;
        }
        if (connectedIds.has(edge.toTodoId) && !connectedIds.has(edge.fromTodoId)) {
          connectedIds.add(edge.fromTodoId);
          changed = true;
        }
      }
    }
    const todos: Todo[] = [];
    for (const id of connectedIds) {
      const t = await getTodo(id);
      if (t) todos.push(t);
    }
    setGraphNodes(todos);
  }

  useEffect(() => {
    loadTodo();
  }, [loadTodo]);

  useEffect(() => {
    if (autoStart && todo && todo.status === 'pending') {
      updateTodoStatus(todoId, 'in_progress').then(() => {
        setTodo((prev) => (prev ? { ...prev, status: 'in_progress', startedAt: new Date() } : prev));
        addLog('system', 'Started execution', {
          metadata: { action: 'status_change', from: 'pending', to: 'in_progress' },
        });
      });
    }
  }, [todo?.status, todo?.id, todoId, autoStart]);

  async function markDone() {
    await updateTodoStatus(todoId, 'done');
    setTodo((prev) =>
      prev ? { ...prev, status: 'done', completedAt: new Date() } : prev
    );
    await addLog('system', 'Marked as done', {
      metadata: { action: 'status_change', from: 'in_progress', to: 'done' },
    });
  }

  async function markUndone() {
    await updateTodoStatus(todoId, 'pending');
    setTodo((prev) =>
      prev ? { ...prev, status: 'pending', completedAt: undefined } : prev
    );
    await addLog('system', 'Reopened — marked as pending', {
      metadata: { action: 'status_change', from: 'done', to: 'pending' },
    });
  }

  async function toggleGoal() {
    if (!todo) return;
    const newVal = !todo.isGoal;
    await updateTodo(todoId, { isGoal: newVal });
    setTodo((prev) => (prev ? { ...prev, isGoal: newVal } : prev));
  }

  async function toggleSubTodo(subId: string, currentStatus: string) {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    await updateTodoStatus(subId, newStatus as 'pending' | 'done');
    const sub = subTodos.find((s) => s.id === subId);
    setSubTodos((prev) =>
      prev.map((s) =>
        s.id === subId
          ? { ...s, status: newStatus as 'pending' | 'done', completedAt: newStatus === 'done' ? new Date() : undefined }
          : s
      )
    );
    if (newStatus === 'done' && sub) {
      await addLog('step_complete', `Completed step: ${sub.title}`, {
        metadata: { stepId: subId, stepTitle: sub.title },
      });
    }
  }

  async function handleAddLog(
    type: 'progress' | 'thought' | 'blocker' | 'decision',
    content: string,
    minutesSpent?: number
  ) {
    await addLog(type, content, minutesSpent ? { minutesSpent } : undefined);
  }

  async function handleCreateEdge(fromTodoId: string, toTodoId: string, type: ActionEdgeType) {
    await createActionEdge(fromTodoId, toTodoId, type);
    const edges = await getAllActionEdgesForTodo(todoId);
    setActionEdges(edges);
    await loadGraphNodes(edges);
  }

  async function handleDeleteEdge(edgeId: string) {
    await deleteActionEdge(edgeId);
    const newEdges = actionEdges.filter((e) => e.id !== edgeId);
    setActionEdges(newEdges);
    await loadGraphNodes(newEdges);
  }

  async function handleUpdateRepeat() {
    if (!todo) return;
    setIsUpdatingRepeat(true);

    const rule: RepeatRule = { type: repeatType };
    if (repeatType === 'weekly') {
      rule.weekDays = repeatWeekDays;
    } else if (repeatType === 'every_n_days') {
      rule.interval = repeatInterval;
    }
    if (repeatEndDate) {
      rule.endDate = new Date(repeatEndDate);
    }

    await updateRepeatRule(todoId, rule);
    setTodo((prev) => (prev ? { ...prev, repeatRule: rule } : prev));
    setShowRepeatForm(false);
    setIsUpdatingRepeat(false);
  }

  async function handleRemoveRepeat() {
    await updateRepeatRule(todoId, undefined);
    setTodo((prev) => (prev ? { ...prev, repeatRule: undefined } : prev));
    setShowRepeatForm(false);
  }

  /* ─── Magic Button callbacks ─── */

  async function handleToggleStatus() {
    if (!todo) return;
    const currentStatus = todo.status;
    const newStatus: TodoStatus = currentStatus === 'in_progress' ? 'pending' : 'in_progress';
    await updateTodoStatus(todoId, newStatus);
    setTodo((prev) =>
      prev
        ? {
            ...prev,
            status: newStatus,
            startedAt: newStatus === 'in_progress' ? new Date() : undefined,
            completedAt: undefined,
          }
        : prev
    );
    const actionLabel = newStatus === 'in_progress' ? 'Started' : 'Paused';
    await addLog('system', `${actionLabel} — marked as ${newStatus}`, {
      metadata: { action: 'status_change', from: currentStatus, to: newStatus },
    });
  }

  async function handleCreateNode(title: string) {
    if (!goalTodo) return;
    const newTodo = await createTodo(title);
    await createActionEdge(newTodo.id, goalTodo.id, 'pre_do');
    const edges = await getAllActionEdgesForTodo(todoId);
    setActionEdges(edges);
    await loadGraphNodes(edges);
    await addLog('system', `Added node to road: ${title}`, {
      metadata: { action: 'node_create', nodeId: newTodo.id, nodeTitle: title },
    });
  }

  async function handleDeleteNode(nodeId: string) {
    await deleteTodo(nodeId);
    const edges = await getAllActionEdgesForTodo(todoId);
    setActionEdges(edges);
    await loadGraphNodes(edges);
    await addLog('system', 'Removed node from road', {
      metadata: { action: 'node_delete', nodeId },
    });
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

  if (isLoadingTodo) {
    return (
      <div className="text-slate-500 dark:text-slate-400">Loading...</div>
    );
  }

  if (!todo) {
    return (
      <div className="text-slate-500 dark:text-slate-400">Todo not found.</div>
    );
  }

  const isDone = todo.status === 'done';
  const doneSubCount = subTodos.filter((s) => s.status === 'done').length;
  const breadcrumbChain = sourceChain.filter((t) => t.id !== todo.id);

  return (
    <div className="space-y-6">
      {/* Traced From breadcrumb */}
      {showBreadcrumbs && breadcrumbChain.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-slate-400 dark:text-slate-500 font-medium">Traced from:</span>
          {breadcrumbChain.map((t, i) => (
            <span key={t.id} className="flex items-center gap-1.5">
              {onNavigate ? (
                <button
                  onClick={() => onNavigate(`/todo/${t.id}`)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[200px]"
                >
                  {t.title}
                </button>
              ) : (
                <span className="text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]">{t.title}</span>
              )}
              {i < breadcrumbChain.length - 1 && (
                <span className="text-slate-300 dark:text-slate-600">/</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Template breadcrumb (for instances) */}
      {showBreadcrumbs && templateTodo && (
        <div className="flex items-center gap-2 text-xs">
          <Repeat className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-slate-400 dark:text-slate-500">Instance of:</span>
          {onNavigate ? (
            <button
              onClick={() => onNavigate(`/todo/${templateTodo.id}`)}
              className="text-violet-600 dark:text-violet-400 hover:underline truncate max-w-[200px] font-medium"
            >
              {templateTodo.title}
            </button>
          ) : (
            <span className="text-violet-600 dark:text-violet-400 truncate max-w-[200px] font-medium">{templateTodo.title}</span>
          )}
        </div>
      )}

      {/* Todo Header */}
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
              {todo.dueDate && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Due {formatDateShort(todo.dueDate)}
                </span>
              )}
              {todo.repeatRule && (
                <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400">
                  <Repeat className="w-3 h-3" />
                  {formatRepeatRule(todo.repeatRule)}
                </span>
              )}
            </div>
            <button
              onClick={toggleGoal}
              className={`inline-flex items-center gap-1.5 mt-2 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                todo.isGoal
                  ? 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={todo.isGoal ? 'This is a goal' : 'Set as goal'}
            >
              <Target className="w-3.5 h-3.5" />
              {todo.isGoal ? 'Goal' : 'Set Goal'}
            </button>

            <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Description
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {todo.description || <span className="text-slate-400 dark:text-slate-500 italic">No description set</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Road to Goal */}
      {goalTodo && (goalTodo.isGoal || actionEdges.length > 0) && (
        <JourneyPath
          goalTodo={goalTodo}
          highlightTodoId={todo.id}
          edges={actionEdges}
          onCreateEdge={handleCreateEdge}
          onDeleteEdge={handleDeleteEdge}
          onNodeClick={onNodeClick}
          onEdgesChange={async () => {
            const edges = await getAllActionEdgesForTodo(todoId);
            setActionEdges(edges);
            await loadGraphNodes(edges);
            const goalId = findUltimateGoalId(todoId, edges);
            if (goalId !== todoId) {
              const g = await getTodo(goalId);
              if (g) setGoalTodo(g);
            } else {
              const t = await getTodo(todoId);
              if (t) setGoalTodo(t);
            }
          }}
        />
      )}

      {/* Goal Tree */}
      <BranchView currentTodoId={todo.id} />

      {/* Road to Goal - Timeline */}
      {sourceChain.length > 1 && (
        <GoalPath chain={sourceChain} currentId={todo.id} onNodeClick={onNodeClick} />
      )}

      {/* Repeat Rule */}
      {todo.repeatRule && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          {!showRepeatForm ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-violet-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Repeating
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatRepeatRule(todo.repeatRule)}
                    {todo.repeatRule.endDate && (
                      <> · Ends {formatDateShort(todo.repeatRule.endDate)}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (todo.repeatRule) {
                      setRepeatType(todo.repeatRule.type);
                      setRepeatWeekDays(todo.repeatRule.weekDays ?? [1, 2, 3, 4, 5]);
                      setRepeatInterval(todo.repeatRule.interval ?? 2);
                      setRepeatEndDate(
                        todo.repeatRule.endDate
                          ? new Date(todo.repeatRule.endDate).toISOString().split('T')[0]
                          : ''
                      );
                    }
                    setShowRepeatForm(true);
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={handleRemoveRepeat}
                  className="text-xs text-rose-500 hover:text-rose-600 font-medium"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Edit Repeat Rule
                </h3>
                <button
                  onClick={() => setShowRepeatForm(false)}
                  className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Repeat pattern
                </label>
                <select
                  value={repeatType}
                  onChange={(e) => setRepeatType(e.target.value as 'daily' | 'weekly' | 'every_n_days')}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week on selected days</option>
                  <option value="every_n_days">Every N days</option>
                </select>
              </div>
              {repeatType === 'weekly' && (
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
                      const isSelected = repeatWeekDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setRepeatWeekDays((prev) => prev.filter((d) => d !== day.value));
                            } else {
                              setRepeatWeekDays((prev) => [...prev, day.value].sort());
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
              {repeatType === 'every_n_days' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Repeat every
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
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
                  value={repeatEndDate}
                  onChange={(e) => setRepeatEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUpdateRepeat}
                  disabled={isUpdatingRepeat || (repeatType === 'weekly' && repeatWeekDays.length === 0)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUpdatingRepeat ? 'Updating...' : 'Update'}
                </button>
                <button
                  onClick={() => setShowRepeatForm(false)}
                  className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plan */}
      {subTodos.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-teal-500" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Plan
              </h2>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {doneSubCount} of {subTodos.length} done
            </span>
          </div>
          <div className="space-y-2">
            {subTodos.map((sub) => {
              const subDone = sub.status === 'done';
              return (
                <div
                  key={sub.id}
                  className={`flex flex-col p-3 rounded-lg border transition-all ${
                    subDone
                      ? 'bg-slate-50 dark:bg-slate-800/50 border-transparent opacity-60'
                      : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'
                  } ${!subDone && sub.isGoal ? 'border-l-2 border-l-amber-400 dark:border-l-amber-500' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => toggleSubTodo(sub.id, sub.status)}
                      className="shrink-0"
                    >
                      {subDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 hover:text-indigo-400 transition-colors" />
                      )}
                    </button>
                    <button
                      onClick={() => setExpandedStepId(expandedStepId === sub.id ? null : sub.id)}
                      className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {expandedStepId === sub.id ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm ${
                          subDone
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {sub.title}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sub.isGoal && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                            Goal
                          </span>
                        )}
                        {sub.scheduledDate && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatTime(sub.scheduledDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {expandedStepId === sub.id && sub.description && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                        {sub.description}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
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
                  onClick={() => onNavigate?.(`/todo/${spawned.id}/execute`)}
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

      {/* Unified Execution Log */}
      <UnifiedLogSection
        logs={logs}
        isLoading={isLoadingLogs}
        onAdd={handleAddLog}
        onDelete={removeLog}
        floatingInput
        todayTodos={todayTodos ?? []}
        onSwitchTodo={(id) => {
          onSwitchTodo?.(id);
        }}
        currentTodoStatus={todo.status}
        onToggleStatus={handleToggleStatus}
        goalTodo={goalTodo}
        graphNodes={graphNodes}
        onCreateNode={handleCreateNode}
        onDeleteNode={handleDeleteNode}
      />
    </div>
  );
}
