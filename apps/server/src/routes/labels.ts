import { Router } from 'express';
import type { Todo } from '@prisma/client';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const todos = await prisma.todo.findMany({
    select: { tags: true },
  });

  const tagCount = new Map<string, number>();
  for (const todo of todos) {
    const tags = todo.tags as string[];
    for (const tag of tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const labels = Array.from(tagCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(labels);
});

router.patch('/rename', async (req, res) => {
  const { oldName, newName } = req.body as { oldName?: string; newName?: string };

  if (!oldName || !newName) {
    return res.status(400).json({ error: 'oldName and newName are required' });
  }

  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();

  if (!trimmedOld || !trimmedNew) {
    return res.status(400).json({ error: 'oldName and newName must not be empty' });
  }

  if (trimmedOld === trimmedNew) {
    return res.status(400).json({ error: 'oldName and newName are the same' });
  }

  const allTodos = await prisma.todo.findMany();
  const todosWithLabel = allTodos.filter((t) => {
    const tags = t.tags as string[];
    return tags.includes(trimmedOld);
  });

  let updated = 0;
  for (const todo of todosWithLabel) {
    const tags = todo.tags as string[];
    const newTags = tags.map((t) => (t === trimmedOld ? trimmedNew : t));
    const uniqueTags = [...new Set(newTags)];

    await prisma.todo.update({
      where: { id: todo.id },
      data: { tags: uniqueTags } as never,
    });
    await logChange(req, 'todo', 'update', todo.id);
    updated++;
  }

  res.json({ renamed: trimmedOld, to: trimmedNew, updatedTodos: updated });
});

router.delete('/:name', async (req, res) => {
  const tagName = decodeURIComponent(req.params.name).trim();

  if (!tagName) {
    return res.status(400).json({ error: 'Label name is required' });
  }

  const allTodos = await prisma.todo.findMany();
  const todosWithLabel = allTodos.filter((t) => {
    const tags = t.tags as string[];
    return tags.includes(tagName);
  });

  let updated = 0;
  for (const todo of todosWithLabel) {
    const tags = todo.tags as string[];
    const newTags = tags.filter((t) => t !== tagName);

    await prisma.todo.update({
      where: { id: todo.id },
      data: { tags: newTags } as never,
    });
    await logChange(req, 'todo', 'update', todo.id);
    updated++;
  }

  res.json({ deleted: tagName, updatedTodos: updated });
});

export default router;
