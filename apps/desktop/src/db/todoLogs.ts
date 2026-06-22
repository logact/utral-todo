import { db } from './database';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { TodoLog, TodoLogType } from '../types';

export async function createTodoLog(
  todoId: string,
  type: TodoLogType,
  content: string,
  options?: { minutesSpent?: number; metadata?: Record<string, unknown> }
): Promise<TodoLog> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const log: TodoLog = {
    id: crypto.randomUUID(),
    todoId,
    type,
    content,
    minutesSpent: options?.minutesSpent,
    metadata: options?.metadata,
    createdAt: hlc,
    updatedAt: hlc,
  };
  await db.todoLogs.add(log);
  onLocalChange('todoLogs', 'create', log.id).catch(() => {});
  return log;
}

export async function getTodoLogs(todoId: string): Promise<TodoLog[]> {
  return db.todoLogs.where('todoId').equals(todoId).toArray();
}

export async function deleteTodoLog(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const existing = await db.todoLogs.get(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.todoLogs.update(id, { deletedAt: hlc, updatedAt: mergedUpdatedAt });
  onLocalChange('todoLogs', 'delete', id).catch(() => {});
}

export async function deleteTodoLogsForTodo(todoId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const logs = await db.todoLogs.where('todoId').equals(todoId).toArray();
  for (const log of logs) {
    const mergedUpdatedAt = log.updatedAt
      ? mergeHLC(log.updatedAt, hlc)
      : hlc;
    await db.todoLogs.update(log.id, { deletedAt: hlc, updatedAt: mergedUpdatedAt }).catch(() => {});
  }
}
