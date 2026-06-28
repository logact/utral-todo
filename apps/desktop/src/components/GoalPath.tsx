import { useState, useEffect, useCallback } from 'react';
import {
  Flag, MapPin, Circle, CheckCircle2, Target, ListTodo,
} from 'lucide-react';
import { getSubTodos } from '../db/todos';
import { getOrderedSuccessors, getOrderedPredecessors, getTasksForGoal } from '../db/relations';
import { formatDuration } from '../utils/date';
import type { Todo } from '../types';

interface GoalPathProps {
  chain: Todo[];
  currentId: string;
  onNodeClick?: (todoId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Status Dot (task status)                                           */
/* ------------------------------------------------------------------ */

function TaskStatusDot({ status }: { status?: string }) {
  if (status === 'done')
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
      </span>
    );
  if (status === 'in_progress')
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-indigo-500" />
      </span>
    );
  return (
    <span className="w-[18px] h-[18px] rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500" />
    </span>
  );
}

function NodeTypeBadge({ nodeType }: { nodeType: string }) {
  if (nodeType === 'goal')
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-white dark:text-indigo-100 uppercase tracking-wider shrink-0 bg-indigo-500 dark:bg-indigo-600 px-2 py-0.5 rounded">
        <Target className="w-3 h-3" />
        Goal
      </span>
    );
  return null;
}

export function GoalPath({ chain, currentId, onNodeClick }: GoalPathProps) {
  const [subTodosMap, setSubTodosMap] = useState<Map<string, Todo[]>>(new Map());
  const [orderedGoalsMap, setOrderedGoalsMap] = useState<Map<string, Todo[]>>(new Map());
  const [achievingTasksMap, setAchievingTasksMap] = useState<Map<string, Todo[]>>(new Map());

  const chainIds = new Set(chain.map((t) => t.id));

  const loadExtras = useCallback(async () => {
    const subMap = new Map<string, Todo[]>();
    const orderedMap = new Map<string, Todo[]>();
    const tasksMap = new Map<string, Todo[]>();

    for (const todo of chain) {
      const subs = await getSubTodos(todo.id);
      const filtered = subs.filter((s) => !chainIds.has(s.id));
      if (filtered.length > 0) subMap.set(todo.id, filtered);

      if (todo.nodeType === 'goal') {
        const successors = await getOrderedSuccessors(todo.id);
        const predecessors = await getOrderedPredecessors(todo.id);
        const ordered = [...predecessors, ...successors].filter(
          (g, i, arr) => !chainIds.has(g.id) && arr.findIndex((x) => x.id === g.id) === i
        );
        if (ordered.length > 0) orderedMap.set(todo.id, ordered);

        const tasks = await getTasksForGoal(todo.id);
        if (tasks.length > 0) tasksMap.set(todo.id, tasks);
      }
    }

    setSubTodosMap(subMap);
    setOrderedGoalsMap(orderedMap);
    setAchievingTasksMap(tasksMap);
  }, [chain, currentId]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  if (chain.length === 0) return null;

  const allVisibleTodos = [
    ...chain,
    ...Array.from(subTodosMap.values()).flat(),
    ...Array.from(orderedGoalsMap.values()).flat(),
    ...Array.from(achievingTasksMap.values()).flat(),
  ];
  const taskTodos = allVisibleTodos.filter((t) => t.nodeType === 'task');
  const doneCount = taskTodos.filter((t) => t.status === 'done').length;
  const totalTasks = taskTodos.length;

  const currentIndex = chain.findIndex((t) => t.id === currentId);
  const ancestors = chain.slice(0, currentIndex + 1);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Flag className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Road to Goal
        </h2>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {ancestors.length} {ancestors.length === 1 ? 'step' : 'steps'}
          {totalTasks > 0 && ` · ${doneCount}/${totalTasks} tasks done`}
        </span>
      </div>

      <div className="relative pl-4">
        {/* Vertical connecting line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="space-y-0">
          {ancestors.map((todo) => {
            const isCurrent = todo.id === currentId;
            const isGoal = todo.nodeType === 'goal';
            const isDone = todo.status === 'done' || todo.goalStatus === 'achieved' || todo.goalStatus === 'abandoned';
            const subs = subTodosMap.get(todo.id) ?? [];
            const orderedGoals = orderedGoalsMap.get(todo.id) ?? [];
            const achievingTasks = achievingTasksMap.get(todo.id) ?? [];

            return (
              <div key={todo.id} className="relative">
                {/* Chain node */}
                <div className="relative flex items-start gap-3 py-1.5">
                  {/* Node dot on the line */}
                  <div className="relative z-10 shrink-0 mt-1.5">
                    {isCurrent ? (
                      <div className="w-[19px] h-[19px] rounded-full bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-400 dark:border-amber-500 flex items-center justify-center">
                        <MapPin className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                      </div>
                    ) : (
                      <div
                        className={`w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center ${
                          isDone
                            ? 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isGoal ? (
                          <div
                            className={`w-2 h-2 rounded-full ${
                              todo.goalStatus === 'achieved'
                                ? 'bg-blue-400'
                                : todo.goalStatus === 'active'
                                  ? 'bg-emerald-400'
                                  : todo.goalStatus === 'paused'
                                    ? 'bg-amber-400'
                                    : 'bg-slate-200 dark:bg-slate-600'
                            }`}
                          />
                        ) : isDone ? (
                          <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-600" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Node card */}
                  <button
                    onClick={() => !isCurrent && onNodeClick?.(todo.id)}
                    disabled={isCurrent}
                    className={`flex-1 min-w-0 text-left rounded-lg border px-3 py-2.5 transition-all ${
                      isCurrent
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/50'
                        : isGoal
                          ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-400 dark:border-indigo-600 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/30'
                          : isDone
                              ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/60 opacity-60'
                              : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isGoal ? (
                        <Target className="w-4 h-4 text-indigo-500 shrink-0" />
                      ) : (
                        <TaskStatusDot status={todo.status ?? 'pending'} />
                      )}
                      <span
                        className={`text-sm font-medium truncate ${
                          isDone
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : isCurrent
                              ? 'text-amber-800 dark:text-amber-300'
                              : isGoal
                                ? 'text-indigo-900 dark:text-indigo-200'
                                : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {todo.title}
                      </span>

                      <NodeTypeBadge nodeType={todo.nodeType} />

                      {isCurrent && (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider shrink-0 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                          Here
                        </span>
                      )}

                      {(todo.estimatedMinutes ?? 0) > 0 && !isGoal && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                          {formatDuration(todo.estimatedMinutes ?? 60)}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Ordered goals (goal -> goal) */}
                {orderedGoals.length > 0 && (
                  <div className="relative ml-[31px] pl-5 pb-2 border-l border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Ordered goals
                    </p>
                    {orderedGoals.map((goal) => {
                      const goalDone = goal.goalStatus === 'achieved' || goal.goalStatus === 'abandoned';
                      return (
                        <div key={goal.id} className="relative">
                          <div className="absolute left-[-21px] top-3.5 w-4 h-px bg-slate-200 dark:bg-slate-700" />
                          <button
                            onClick={() => onNodeClick?.(goal.id)}
                            className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md transition-colors ${
                              goalDone
                                ? 'opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span
                              className={`text-sm truncate ${
                                goalDone
                                  ? 'text-slate-400 dark:text-slate-500 line-through'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {goal.title}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tasks that achieve this goal (task -> goal) */}
                {achievingTasks.length > 0 && (
                  <div className="relative ml-[31px] pl-5 pb-2 border-l border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Achieved by
                    </p>
                    {achievingTasks.map((task) => {
                      const taskDone = task.status === 'done';
                      const taskInProgress = task.status === 'in_progress';
                      return (
                        <div key={task.id} className="relative">
                          <div className="absolute left-[-21px] top-3.5 w-4 h-px bg-slate-200 dark:bg-slate-700" />
                          <button
                            onClick={() => onNodeClick?.(task.id)}
                            className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md transition-colors ${
                              taskDone
                                ? 'opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            {taskDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : taskInProgress ? (
                              <Circle className="w-3.5 h-3.5 text-indigo-400 shrink-0 fill-indigo-400" />
                            ) : (
                              <ListTodo className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500 shrink-0" />
                            )}
                            <span
                              className={`text-sm truncate ${
                                taskDone
                                  ? 'text-slate-400 dark:text-slate-500 line-through'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {task.title}
                            </span>
                            {(task.estimatedMinutes ?? 0) > 0 && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                {formatDuration(task.estimatedMinutes ?? 60)}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sub-todos under this chain node */}
                {subs.length > 0 && (
                  <div className="relative ml-[31px] pl-5 pb-2 border-l border-slate-200 dark:border-slate-700">
                    {subs.map((sub) => {
                      const subDone = sub.status === 'done';
                      const subInProgress = sub.status === 'in_progress';

                      return (
                        <div key={sub.id} className="relative">
                          {/* Horizontal connector */}
                          <div className="absolute left-[-21px] top-3.5 w-4 h-px bg-slate-200 dark:bg-slate-700" />
                          <button
                            onClick={() => onNodeClick?.(sub.id)}
                            className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md transition-colors ${
                              subDone
                                ? 'opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            {sub.nodeType === 'goal' ? (
                              <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : subDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : subInProgress ? (
                              <Circle className="w-3.5 h-3.5 text-indigo-400 shrink-0 fill-indigo-400" />
                            ) : (
                              <ListTodo className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500 shrink-0" />
                            )}
                            <span
                              className={`text-sm truncate ${
                                subDone
                                  ? 'text-slate-400 dark:text-slate-500 line-through'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {sub.title}
                            </span>
                            {(sub.estimatedMinutes ?? 0) > 0 && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                {formatDuration(sub.estimatedMinutes ?? 60)}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
