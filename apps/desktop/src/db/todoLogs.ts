import { db } from './drizzle-adapter';
import { todoLogs } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
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
  };
  await db.insert(todoLogs).values(todoLogToRow(log) as any);
  onLocalChange('todoLogs', 'create', log.id).catch(() => {});
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
    deleted_at_wall: hlc.wall,
    deleted_at_counter: hlc.counter,
    deleted_at_node: hlc.node,
    updated_at_wall: mergedUpdatedAt.wall,
    updated_at_counter: mergedUpdatedAt.counter,
    updated_at_node: mergedUpdatedAt.node,
  } as any).where(eq(todoLogs.id, id));
  onLocalChange('todoLogs', 'delete', id).catch(() => {});
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
      deleted_at_wall: hlc.wall,
      deleted_at_counter: hlc.counter,
      deleted_at_node: hlc.node,
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    } as any).where(eq(todoLogs.id, log.id)).catch(() => {});
  }
}
