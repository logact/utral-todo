import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from '../db/todos';
import { setOccurrenceStatus } from '../db/repeatOccurrences';
import { db } from '../db/database';
import {
  isVirtualTodoId,
  parseVirtualTodoId,
  dateMatchesRule,
  computeVirtualTodo,
} from '../types';
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

  useEffect(() => {
    refresh();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

  const add = useCallback(
    async (
      title: string,
      options?: {
        parentId?: string;
        description?: string;
        instructions?: string;
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
        instructions?: string;
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

  useEffect(() => {
    refresh();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

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

export function useTodayData() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [overdue, setOverdue] = useState<Todo[]>([]);
  const [inProgress, setInProgress] = useState<Todo[]>([]);
  const [suggested, setSuggested] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [todayTodos, overdueTodos, progressTodos, suggestTodos] =
      await Promise.all([
        getTodaysTodos(),
        getOverdueTodos(),
        getInProgressTodos(),
        getUnscheduledHighPriorityTodos(),
      ]);
    setTodos(todayTodos);
    setOverdue(overdueTodos);
    setInProgress(progressTodos);
    setSuggested(suggestTodos);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    const updateTodoFn = (t: Todo) => ({
      ...t,
      status,
      completedAt: status === 'done' ? new Date() : undefined,
      startedAt: status === 'in_progress' ? new Date() : status === 'pending' ? undefined : t.startedAt,
    });

    if (isVirtualTodoId(id)) {
      const parsed = parseVirtualTodoId(id);
      if (!parsed) return;
      await setOccurrenceStatus(parsed.templateId, new Date(parsed.dateKey), status);
      setTodos((prev) => prev.map((t) => (t.id === id ? updateTodoFn(t) : t)));
      setOverdue((prev) => prev.map((t) => (t.id === id ? updateTodoFn(t) : t)));
      return;
    }

    await updateTodoStatus(id, status);
    setTodos((prev) => prev.map((t) => (t.id === id ? updateTodoFn(t) : t)));
    setOverdue((prev) => prev.map((t) => (t.id === id ? updateTodoFn(t) : t)));
    setInProgress((prev) => {
      const exists = prev.find((t) => t.id === id);
      if (status === 'in_progress') {
        if (exists) {
          return prev.map((t) => (t.id === id ? updateTodoFn(t) : t));
        }
        const todo = [...todos, ...overdue, ...suggested].find((t) => t.id === id);
        if (todo) {
          return [...prev, updateTodoFn(todo)];
        }
        return prev;
      }
      return prev.filter((t) => t.id !== id);
    });
    setSuggested((prev) => prev.filter((t) => t.id !== id));
  }, [todos, overdue, suggested]);

  const schedule = useCallback(async (id: string, date: Date) => {
    if (isVirtualTodoId(id)) return;
    await updateTodoSchedule(id, date);
    // Refresh everything since a scheduled todo may now appear in today's list
    const [todayTodos, overdueTodos, progressTodos, suggestTodos] =
      await Promise.all([
        getTodaysTodos(),
        getOverdueTodos(),
        getInProgressTodos(),
        getUnscheduledHighPriorityTodos(),
      ]);
    setTodos(todayTodos);
    setOverdue(overdueTodos);
    setInProgress(progressTodos);
    setSuggested(suggestTodos);
  }, []);

  return {
    todos,
    overdue,
    inProgress,
    suggested,
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
      db.todos.where('scheduledDate').above(new Date(0)).and((t) => t.status !== 'done').toArray(),
      getUnscheduledTodos(),
      getRepeatTemplates(),
      db.repeatOccurrences.toArray(),
    ]);
    setRealTodos([...allScheduled, ...unscheduled]);
    setTemplates(allTemplates);
    setOccurrences(allOccurrences);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), 100);
    };
    window.addEventListener('sync:remote-applied', handler);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
    };
  }, [refresh]);

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
      setOccurrences((prev) => {
        const existing = prev.find((o) => o.id === id);
        if (existing) {
          return prev.map((o) =>
            o.id === id
              ? { ...o, status, completedAt: status === 'done' ? new Date() : undefined, updatedAt: new Date() }
              : o
          );
        }
        return [...prev, { id, templateId: parsed.templateId, date: new Date(parsed.dateKey), status, completedAt: status === 'done' ? new Date() : undefined, createdAt: new Date(), updatedAt: new Date() }];
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
