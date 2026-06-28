import { db } from './drizzle-adapter';
import { todos } from './schema';
import { eq } from 'drizzle-orm';
import { onLocalChange, getOrCreateDeviceId } from './syncEngine';
import { newHLC, mergeHLC } from '../types';
import type { Label } from '../types';
import { rowToTodo } from './schema';

export async function getAllLabels(): Promise<Label[]> {
  const rows = await db.select().from(todos) as any[];
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

export async function renameLabel(oldName: string, newName: string): Promise<number> {
  const rows = await db.select().from(todos) as any[];
  const allTodos = rows.map(rowToTodo).filter((t) => (t.tags ?? []).includes(oldName));

  const nodeId = await getOrCreateDeviceId();
  let updated = 0;
  for (const todo of allTodos) {
    const hlc = newHLC(nodeId);
    const mergedUpdatedAt = todo.updatedAt
      ? mergeHLC(todo.updatedAt, hlc)
      : hlc;
    const newTags = (todo.tags ?? []).map((t) => (t === oldName ? newName : t));
    const uniqueTags = [...new Set(newTags)];
    await db.update(todos).set({
      tags: JSON.stringify(uniqueTags),
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    } as any).where(eq(todos.id, todo.id));
    onLocalChange('todos', 'update', todo.id).catch(() => {});
    updated++;
  }

  return updated;
}

export async function deleteLabel(name: string): Promise<number> {
  const rows = await db.select().from(todos) as any[];
  const allTodos = rows.map(rowToTodo).filter((t) => (t.tags ?? []).includes(name));

  const nodeId = await getOrCreateDeviceId();
  let updated = 0;
  for (const todo of allTodos) {
    const hlc = newHLC(nodeId);
    const mergedUpdatedAt = todo.updatedAt
      ? mergeHLC(todo.updatedAt, hlc)
      : hlc;
    const newTags = (todo.tags ?? []).filter((t) => t !== name);
    await db.update(todos).set({
      tags: JSON.stringify(newTags),
      updated_at_wall: mergedUpdatedAt.wall,
      updated_at_counter: mergedUpdatedAt.counter,
      updated_at_node: mergedUpdatedAt.node,
    } as any).where(eq(todos.id, todo.id));
    onLocalChange('todos', 'update', todo.id).catch(() => {});
    updated++;
  }

  return updated;
}
