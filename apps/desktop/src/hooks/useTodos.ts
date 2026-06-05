import { useState, useEffect, useCallback } from 'react';
import {
  getTodaysTodos,
  getAllTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  updateTodoStatus,
  updateTodoSchedule,
  syncRepeatInstances,
  getOverdueTodos,
  getInProgressTodos,
  getUnscheduledHighPriorityTodos,
  reorderTodos,
} from '../db/todos';
import { getAllRelations } from '../db/relations';
import type { Todo, TodoStatus, Priority } from '../types';

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [repeatInstanceIds, setRepeatInstanceIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [all, relations] = await Promise.all([getAllTodos(), getAllRelations()]);
    const instanceIds = new Set(
      relations
        .filter((r) => r.type === 'assign_from')
        .map((r) => r.toTodoId)
    );
    setTodos(all);
    setRepeatInstanceIds(instanceIds);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
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

  const syncRepeats = useCallback(async (start: Date, end: Date) => {
    const count = await syncRepeatInstances(start, end);
    if (count > 0) {
      const all = await getAllTodos();
      setTodos(all);
    }
  }, []);

  return { todos, isLoading, refresh, add, addSubTodo, update, remove, setStatus, reorder, syncRepeats, repeatInstanceIds };
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
  }, [refresh]);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
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
  }, [refresh]);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    await updateTodoStatus(id, status);
    const updateTodoFn = (t: Todo) => ({
      ...t,
      status,
      completedAt: status === 'done' ? new Date() : undefined,
      startedAt: status === 'in_progress' ? new Date() : status === 'pending' ? undefined : t.startedAt,
    });
    setTodos((prev) => prev.map((t) => (t.id === id ? updateTodoFn(t) : t)));
    setOverdue((prev) => prev.map((t) => (t.id === id ? updateTodoFn(t) : t)));
    setInProgress((prev) => {
      const exists = prev.find((t) => t.id === id);
      if (status === 'in_progress') {
        if (exists) {
          return prev.map((t) => (t.id === id ? updateTodoFn(t) : t));
        }
        // Find the todo from other lists so we can add it to inProgress
        const todo = [...todos, ...overdue, ...suggested].find((t) => t.id === id);
        if (todo) {
          return [...prev, updateTodoFn(todo)];
        }
        return prev;
      }
      // Remove from inProgress if no longer in_progress
      return prev.filter((t) => t.id !== id);
    });
    setSuggested((prev) => prev.filter((t) => t.id !== id));
  }, [todos, overdue, suggested]);

  const schedule = useCallback(async (id: string, date: Date) => {
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

export function useScheduleTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 60);
    await syncRepeatInstances(start, end);

    const all = await getAllTodos();
    setTodos(all);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const schedule = useCallback(async (id: string, date: Date | undefined) => {
    await updateTodoSchedule(id, date);
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, scheduledDate: date } : t))
    );
  }, []);

  const setStatus = useCallback(async (id: string, status: TodoStatus) => {
    await updateTodoStatus(id, status);
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status, completedAt: status === 'done' ? new Date() : undefined }
          : t
      )
    );
  }, []);

  const getForDate = useCallback(
    (date: Date) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return todos.filter((t) => {
        if (!t.scheduledDate) return false;
        const d = new Date(t.scheduledDate);
        return d >= start && d < end;
      });
    },
    [todos]
  );

  const unscheduled = useCallback(() => {
    return todos.filter((t) => !t.scheduledDate && t.status !== 'done');
  }, [todos]);

  return { todos, isLoading, refresh, schedule, setStatus, getForDate, unscheduled };
}
