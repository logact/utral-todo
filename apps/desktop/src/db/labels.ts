import { db } from './database';
import { onLocalChange } from './syncEngine';
import type { Label } from '../types';

export async function getAllLabels(): Promise<Label[]> {
  const todos = await db.todos.toArray();
  const tagCount = new Map<string, number>();

  for (const todo of todos) {
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
  const todos = await db.todos
    .filter((t) => (t.tags ?? []).includes(oldName))
    .toArray();

  let updated = 0;
  for (const todo of todos) {
    const newTags = (todo.tags ?? []).map((t) => (t === oldName ? newName : t));
    const uniqueTags = [...new Set(newTags)];
    await db.todos.update(todo.id, { tags: uniqueTags, updatedAt: new Date() });
    onLocalChange('todos', 'update', todo.id).catch(() => {});
    updated++;
  }

  return updated;
}

export async function deleteLabel(name: string): Promise<number> {
  const todos = await db.todos
    .filter((t) => (t.tags ?? []).includes(name))
    .toArray();

  let updated = 0;
  for (const todo of todos) {
    const newTags = (todo.tags ?? []).filter((t) => t !== name);
    await db.todos.update(todo.id, { tags: newTags, updatedAt: new Date() });
    onLocalChange('todos', 'update', todo.id).catch(() => {});
    updated++;
  }

  return updated;
}
