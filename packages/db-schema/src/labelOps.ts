import { eq } from 'drizzle-orm';
import { todos } from './schema.js';
import { rowToTodo } from './converters.js';
import { newHLC, mergeHLC } from '@utral/sync-share';
import type { Label } from '@utral/types';
import type { DbStore } from './store.js';

export async function getAllLabels(store: DbStore): Promise<Label[]> {
  const rows = (await store.db
    .select()
    .from(todos)
    .where(eq(todos.isDeleted, false))) as any[];
  const allTodos = rows.map(rowToTodo);
  const tagCount = new Map<string, number>();

  for (const todo of allTodos) {
    const tags = todo.tags ?? [];
    for (const tag of tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(tagCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function renameLabel(
  store: DbStore,
  oldName: string,
  newName: string
): Promise<number> {
  const rows = (await store.db
    .select()
    .from(todos)
    .where(eq(todos.isDeleted, false))) as any[];
  const allTodos = rows.map(rowToTodo).filter((t) => (t.tags ?? []).includes(oldName));

  const nodeId = store.deviceId;
  let updated = 0;
  for (const todo of allTodos) {
    const hlc = newHLC(nodeId);
    const mergedUpdatedAt = todo.updatedAt
      ? mergeHLC(todo.updatedAt, hlc)
      : hlc;
    const newTags = (todo.tags ?? []).map((t) => (t === oldName ? newName : t));
    const uniqueTags = [...new Set(newTags)];
    await store.db
      .update(todos)
      .set({
        tags: uniqueTags,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todos.id, todo.id));
    await store.notifyDbOperation('todos', 'update', todo.id);
    updated++;
  }

  return updated;
}

export async function deleteLabel(store: DbStore, name: string): Promise<number> {
  const rows = (await store.db
    .select()
    .from(todos)
    .where(eq(todos.isDeleted, false))) as any[];
  const allTodos = rows.map(rowToTodo).filter((t) => (t.tags ?? []).includes(name));

  const nodeId = store.deviceId;
  let updated = 0;
  for (const todo of allTodos) {
    const hlc = newHLC(nodeId);
    const mergedUpdatedAt = todo.updatedAt
      ? mergeHLC(todo.updatedAt, hlc)
      : hlc;
    const newTags = (todo.tags ?? []).filter((t) => t !== name);
    await store.db
      .update(todos)
      .set({
        tags: newTags,
        updatedAtWall: mergedUpdatedAt.wall,
        updatedAtCounter: mergedUpdatedAt.counter,
        updatedAtNode: mergedUpdatedAt.node,
      })
      .where(eq(todos.id, todo.id));
    await store.notifyDbOperation('todos', 'update', todo.id);
    updated++;
  }

  return updated;
}
