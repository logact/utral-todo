import { eq } from 'drizzle-orm';
import { todoLogs } from './schema.js';
import { todoLogToRow, rowToTodoLog } from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import type { TodoLog, TodoLogType } from '@utral/types';
import { getGenerateId, type DbStore } from './store.js';

export async function createTodoLog(
  store: DbStore,
  todoId: string,
  type: TodoLogType,
  content: string,
  options?: { minutesSpent?: number; metadata?: Record<string, unknown> }
): Promise<TodoLog> {
  const generateId = getGenerateId(store);
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const log: TodoLog = {
    id: generateId(),
    todoId,
    type,
    content,
    minutesSpent: options?.minutesSpent,
    metadata: options?.metadata,
    createdAt: hlc,
    updatedAt: hlc,
    isDeleted: false,
  };
  await store.db.insert(todoLogs).values(todoLogToRow(log));
  await store.notifyDbOperation('todoLogs', 'create', log.id);
  return log;
}

export async function getTodoLogs(store: DbStore, todoId: string): Promise<TodoLog[]> {
  const rows = (await store.db
    .select()
    .from(todoLogs)
    .where(eq(todoLogs.todoId, todoId))) as any[];
  return rows.map(rowToTodoLog);
}

export async function deleteTodoLog(store: DbStore, id: string): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const rows = (await store.db.select().from(todoLogs).where(eq(todoLogs.id, id))) as any[];
  const existing = rows[0] ? rowToTodoLog(rows[0]) : undefined;
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, hlc)
    : hlc;
  await store.db
    .update(todoLogs)
    .set({
      isDeleted: true,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    })
    .where(eq(todoLogs.id, id));
  await store.notifyDbOperation('todoLogs', 'delete', id);
}

export async function deleteTodoLogsForTodo(
  store: DbStore,
  todoId: string
): Promise<void> {
  const nodeId = store.deviceId;
  const hlc = newHLC(nodeId);
  const rows = (await store.db
    .select()
    .from(todoLogs)
    .where(eq(todoLogs.todoId, todoId))) as any[];
  const logs = rows.map(rowToTodoLog);
  for (const log of logs) {
    const mergedUpdatedAt = log.updatedAt
      ? mergeHLC(log.updatedAt, hlc)
      : hlc;
    await store.db
      .update(todoLogs)
      .set({
        isDeleted: true,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todoLogs.id, log.id))
      .catch(() => {});
    await store.notifyDbOperation('todoLogs', 'delete', log.id);
  }
}
