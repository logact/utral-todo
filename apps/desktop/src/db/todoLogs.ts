import { db } from './drizzle-adapter';
import { todoLogs } from './schema';
import { eq } from 'drizzle-orm';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { TodoLog, TodoLogType } from '../types';
import { todoLogToRow, rowToTodoLog } from './schema';

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
    isDeleted: false,
  };
  await db.insert(todoLogs).values(todoLogToRow(log));
  syncLocalChange('todoLogs', 'create', log.id).catch(() => {});
  return log;
}

export async function getTodoLogs(todoId: string): Promise<TodoLog[]> {
  const rows = await db.select().from(todoLogs).where(
    eq(todoLogs.todoId, todoId)
  ) as any[];
  return rows.map(rowToTodoLog);
}

export async function deleteTodoLog(id: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const rows = await db.select().from(todoLogs).where(eq(todoLogs.id, id)) as any[];
  const existing = rows[0] ? rowToTodoLog(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await db.update(todoLogs).set({
    isDeleted: true,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(todoLogs.id, id));
  syncLocalChange('todoLogs', 'delete', id).catch(() => {});
}

export async function deleteTodoLogsForTodo(todoId: string): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const rows = await db.select().from(todoLogs).where(
    eq(todoLogs.todoId, todoId)
  ) as any[];
  const logs = rows.map(rowToTodoLog);
  for (const log of logs) {
    const mergedUpdatedAt = log.updatedAt
      ? mergeHLC(log.updatedAt, hlc)
      : hlc;
    await db.update(todoLogs).set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    }).where(eq(todoLogs.id, log.id)).catch(() => {});
  }
}
