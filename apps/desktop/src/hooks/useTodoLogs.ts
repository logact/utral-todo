import { useState, useCallback } from 'react';
import { useDbChangeRefresh } from './useDbChangeRefresh';
import type { TodoLog, TodoLogType } from '../types';
import { dbStore } from '../db/store';
import { createTodoLog, deleteTodoLog, getTodoLogs } from '@utral/db-schema/todo-log-ops';

export function useTodoLogs(todoId: string) {
  const [logs, setLogs] = useState<TodoLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const data = await getTodoLogs(dbStore, todoId);
    setLogs(data);
    setIsLoading(false);
  }, [todoId]);

  useDbChangeRefresh(refresh, { tables: ['todoLogs', 'todos'] });

  const add = useCallback(
    async (type: TodoLogType, content: string, options?: { minutesSpent?: number; metadata?: Record<string, unknown> }) => {
      const log = await createTodoLog(dbStore, todoId, type, content, options);
      setLogs((prev) => [...prev, log]);
      return log;
    },
    [todoId]
  );

  const remove = useCallback(async (id: string) => {
    await deleteTodoLog(dbStore, id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return { logs, isLoading, refresh, add, remove };
}
