import { useState, useCallback, useMemo } from 'react';
import { useDbChangeRefresh } from './useDbChangeRefresh';
import {
  getTodaysTodos,
  getAllTodos,
  getUnscheduledTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  updateTodoStatus,
  updateTodoSchedule,
  getOverdueTodos,
  getInProgressTodos,
  getUnscheduledHighPriorityTodos,
  reorderTodos,
  getRepeatTemplates,
  getTodaysGoals,
} from '../db/todos';
import { setOccurrenceStatus } from '../db/repeatOccurrences';
import { db } from '../db/drizzle-adapter';
import { todos as todosTable, repeatOccurrences } from '../db/schema';
import { gte } from 'drizzle-orm';
import {
  isVirtualTodoId,
  parseVirtualTodoId,
  dateMatchesRule,
  computeVirtualTodo,
  newHLC,
} from '../types';
import { getOrCreateDeviceId } from '../lib/sync/syncEngine';
import type { Todo, TodoStatus, Priority, RepeatOccurrence } from '../types';

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const all = await getAllTodos();
    setTodos(all);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo', 'relations', 'todoRelation', 'repeatOccurrences', 'repeatOccurrence'] });

  const add = useCallback(
    async (
      title: string,
      options?: {
        parentId?: string;
        description?: string;
        priority?: Priority;
        estimatedMinutes?: number;
        dueDate?: Date;
        scheduledDate?: Date;
        tags?: string[];
      }
    ) => {
      const todo = await createTodo(title, options);
      setTodos((prev) => [...prev, todo]);
      return todo;
    },
    []
  );

  const addSubTodo = useCallback(
    async (
      parentId: string,
      title: string,
      options?: {
        description?: string;
        priority?: Priority;
        estimatedMinutes?: number;
        dueDate?: Date;
        scheduledDate?: Date;
        tags?: string[];
      }
    ) => {
      const todo = await createTodo(title, { ...options, parentId });
      setTodos((prev) => [...prev, todo]);
      return todo;
    },
    []
  );

  const update = useCallback(async (id: string, updates: Partial<Todo>) => {
    await updateTodo(id, updates);
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id && !isDescendant(t, id, prev)));
  }, []);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    if (isVirtualTodoId(id)) {
      const parsed = parseVirtualTodoId(id);
      if (!parsed) return;
      await setOccurrenceStatus(parsed.templateId, new Date(parsed.dateKey), status);
      return;
    }
    await updateTodoStatus(id, status);
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status, completedAt: status === 'done' ? new Date() : undefined }
          : t
      )
    );
  }, []);

  const reorder = useCallback(async (orderedIds: string[]) => {
    await reorderTodos(orderedIds);
    setTodos((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Todo[];
      const remaining = prev.filter((t) => !orderedIds.includes(t.id));
      return [...reordered, ...remaining];
    });
  }, []);

  return { todos, isLoading, refresh, add, addSubTodo, update, remove, setStatus, reorder };
}

function isDescendant(todo: Todo, ancestorId: string, allTodos: Todo[]): boolean {
  if (!todo.parentId) return false;
  if (todo.parentId === ancestorId) return true;
  const parent = allTodos.find((t) => t.id === todo.parentId);
  if (!parent) return false;
  return isDescendant(parent, ancestorId, allTodos);
}

export function useTodaysTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = await getTodaysTodos();
    setTodos(today);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo', 'relations', 'todoRelation', 'repeatOccurrences', 'repeatOccurrence', 'pluses', 'pluse', 'actionEdges', 'actionEdge', 'plans', 'plan'] });

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    if (isVirtualTodoId(id)) {
      const parsed = parseVirtualTodoId(id);
      if (!parsed) return;
      await setOccurrenceStatus(parsed.templateId, new Date(parsed.dateKey), status);
      setTodos((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, status, completedAt: status === 'done' ? new Date() : undefined }
            : t
        )
      );
      return;
    }
    await updateTodoStatus(id, status);
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status, completedAt: status === 'done' ? new Date() : undefined }
          : t
      )
    );
  }, []);

  return { todos, isLoading, refresh, setStatus };
}

export function useTodayScheduled() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = await getTodaysTodos();
    setTodos(today);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo', 'relations', 'todoRelation', 'repeatOccurrences', 'repeatOccurrence'] });

  return { todos, isLoading, refresh };
}

export function useTodayInProgress() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = await getInProgressTodos();
    setTodos(today);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo'] });

  return { todos, isLoading, refresh };
}

export function useTodayOverdue() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = await getOverdueTodos();
    setTodos(today);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo'] });

  return { todos, isLoading, refresh };
}

export function useTodayGoals() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = await getTodaysGoals();
    setTodos(today);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo', 'relations', 'todoRelation'] });

  return { todos, isLoading, refresh };
}

export function useTodaySuggested() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = await getUnscheduledHighPriorityTodos();
    setTodos(today);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo'] });

  return { todos, isLoading, refresh };
}

export function useTodayData() {
  const { todos: scheduled, isLoading: scheduledLoading, refresh: refreshScheduled } = useTodayScheduled();
  const { todos: inProgress, isLoading: inProgressLoading, refresh: refreshInProgress } = useTodayInProgress();
  const { todos: overdue, isLoading: overdueLoading, refresh: refreshOverdue } = useTodayOverdue();
  const { todos: suggested, isLoading: suggestedLoading, refresh: refreshSuggested } = useTodaySuggested();
  const { todos: todayGoals, isLoading: goalsLoading, refresh: refreshGoals } = useTodayGoals();

  const isLoading = scheduledLoading || inProgressLoading || overdueLoading || suggestedLoading || goalsLoading;

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshScheduled(),
      refreshInProgress(),
      refreshOverdue(),
      refreshSuggested(),
      refreshGoals(),
    ]);
  }, [refreshScheduled, refreshInProgress, refreshOverdue, refreshSuggested, refreshGoals]);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    if (isVirtualTodoId(id)) {
      const parsed = parseVirtualTodoId(id);
      if (!parsed) return;
      await setOccurrenceStatus(parsed.templateId, new Date(parsed.dateKey), status);
      return;
    }

    await updateTodoStatus(id, status);
    await refresh();
  }, [refresh]);

  const schedule = useCallback(async (id: string, date: Date) => {
    if (isVirtualTodoId(id)) return;
    await updateTodoSchedule(id, date);
    await refresh();
  }, [refresh]);

  return {
    todos: scheduled,
    overdue,
    inProgress,
    suggested,
    todayGoals,
    isLoading,
    refresh,
    setStatus,
    schedule,
  };
}

function dateKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export function useScheduleTodos() {
  const [realTodos, setRealTodos] = useState<Todo[]>([]);
  const [templates, setTemplates] = useState<Todo[]>([]);
  const [occurrences, setOccurrences] = useState<RepeatOccurrence[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [allScheduled, unscheduled, allTemplates, allOccurrences] = await Promise.all([
      (async () => {
        const rows = await db.select().from(todosTable).where(
          gte(todosTable.scheduledDate, new Date(0))
        ) as any[];
        return rows.filter((t: any) => t.status !== 'done');
      })(),
      getUnscheduledTodos(),
      getRepeatTemplates(),
      (async () => {
        const rows = await db.select().from(repeatOccurrences) as any[];
        return rows;
      })(),
    ]);
    setRealTodos([...allScheduled, ...unscheduled]);
    setTemplates(allTemplates);
    setOccurrences(allOccurrences);
    setIsLoading(false);
  }, []);

  useDbChangeRefresh(refresh, { tables: ['todos', 'todo', 'relations', 'todoRelation', 'repeatOccurrences', 'repeatOccurrence'] });

  const todoMapByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();

    for (const todo of realTodos) {
      if (!todo.scheduledDate || todo.status === 'done') continue;
      const key = dateKey(todo.scheduledDate);
      const list = map.get(key);
      if (list) list.push(todo);
      else map.set(key, [todo]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 30);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 90);

    const occurrencesByKey = new Map<string, RepeatOccurrence>();
    for (const o of occurrences) {
      occurrencesByKey.set(`${o.templateId}:${dateKey(o.date)}`, o);
    }

    for (const template of templates) {
      if (!template.repeatRule) continue;
      const current = new Date(windowStart);
      const ruleEnd = template.repeatRule.endDate
        ? new Date(template.repeatRule.endDate).setHours(0, 0, 0, 0)
        : undefined;

      while (current.getTime() <= windowEnd.getTime()) {
        if (ruleEnd && current.getTime() > ruleEnd) break;
        if (dateMatchesRule(current, template.repeatRule)) {
          const key = dateKey(current);
          const occurrence = occurrencesByKey.get(`${template.id}:${key}`);
          if (!occurrence?.materializedTodoId) {
            const virtual = computeVirtualTodo(template, new Date(current), occurrence);
            const list = map.get(key);
            if (list) list.push(virtual);
            else map.set(key, [virtual]);
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return map;
  }, [realTodos, templates, occurrences]);

  const schedule = useCallback(async (id: string, date: Date | undefined) => {
    if (isVirtualTodoId(id)) return;
    await updateTodoSchedule(id, date);
    setRealTodos((prev) => prev.map((t) => (t.id === id ? { ...t, scheduledDate: date } : t)));
  }, []);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    if (isVirtualTodoId(id)) {
      const parsed = parseVirtualTodoId(id);
      if (!parsed) return;
      await setOccurrenceStatus(parsed.templateId, new Date(parsed.dateKey), status);
      const nodeId = await getOrCreateDeviceId();
      const hlc = newHLC(nodeId);
      setOccurrences((prev) => {
        const existing = prev.find((o) => o.id === id);
        if (existing) {
          return prev.map((o) =>
            o.id === id
              ? { ...o, status, completedAt: status === 'done' ? new Date() : undefined, updatedAt: hlc }
              : o
          );
        }
        return [...prev, { id, templateId: parsed.templateId, date: new Date(parsed.dateKey), status, completedAt: status === 'done' ? new Date() : undefined, createdAt: hlc, updatedAt: hlc, isDeleted: false }];
      });
      return;
    }
    await updateTodoStatus(id, status);
    setRealTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status, completedAt: status === 'done' ? new Date() : undefined } : t)));
  }, []);

  const getForDate = useCallback(
    (date: Date) => todoMapByDate.get(dateKey(date)) ?? [],
    [todoMapByDate]
  );

  const unscheduledTodos = useMemo(
    () => realTodos.filter((t) => !t.scheduledDate && t.status !== 'done'),
    [realTodos]
  );

  return { todos: realTodos, isLoading, refresh, schedule, setStatus, getForDate, unscheduled: unscheduledTodos };
}
