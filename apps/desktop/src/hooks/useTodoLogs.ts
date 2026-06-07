import { useState, useEffect, useCallback } from 'react';
import { getTodoLogs, createTodoLog, deleteTodoLog } from '../db/todoLogs';
import type { TodoLog, TodoLogType } from '../types';

export function useTodoLogs(todoId: string) {
  const [logs, setLogs] = useState<TodoLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const data = await getTodoLogs(todoId);
    setLogs(data);
    setIsLoading(false);
  }, [todoId]);

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
    async (type: TodoLogType, content: string, options?: { minutesSpent?: number; metadata?: Record<string, unknown> }) => {
      const log = await createTodoLog(todoId, type, content, options);
      setLogs((prev) => [...prev, log]);
      return log;
    },
    [todoId]
  );

  const remove = useCallback(async (id: string) => {
    await deleteTodoLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return { logs, isLoading, refresh, add, remove };
}
