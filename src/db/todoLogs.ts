import { db } from './database';
import type { TodoLog, TodoLogType } from '../types';

export async function createTodoLog(
  todoId: string,
  type: TodoLogType,
  content: string,
  options?: { minutesSpent?: number; metadata?: Record<string, unknown> }
): Promise<TodoLog> {
  const log: TodoLog = {
    id: crypto.randomUUID(),
    todoId,
    type,
    content,
    minutesSpent: options?.minutesSpent,
    metadata: options?.metadata,
    createdAt: new Date(),
  };
  await db.todoLogs.add(log);
  return log;
}

export async function getTodoLogs(todoId: string): Promise<TodoLog[]> {
  return db.todoLogs.where('todoId').equals(todoId).toArray();
}

export async function deleteTodoLog(id: string): Promise<void> {
  await db.todoLogs.delete(id);
}

export async function deleteTodoLogsForTodo(todoId: string): Promise<void> {
  const logs = await db.todoLogs.where('todoId').equals(todoId).toArray();
  for (const log of logs) {
    await db.todoLogs.delete(log.id).catch(() => {});
  }
}
