import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const relations = await prisma.todoRelation.findMany();
  res.json(relations);
});

router.post('/', async (req, res) => {
  const { fromTodoId, toTodoId, type } = req.body;
  if (fromTodoId === toTodoId) {
    return res.status(400).json({ error: 'Cannot create a relation from a todo to itself' });
  }
  const existing = await prisma.todoRelation.findFirst({
    where: { fromTodoId, toTodoId, type },
  });
  if (existing) {
    return res.status(409).json({ error: 'This relation already exists' });
  }
  const relation = await prisma.todoRelation.create({
    data: { fromTodoId, toTodoId, type },
  });
  await logChange(req, 'todoRelation', 'create', relation.id, relation);
  res.status(201).json(relation);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.todoRelation.delete({ where: { id } });
  await logChange(req, 'todoRelation', 'delete', id);
  res.status(204).send();
});

router.get('/source-chain/:id', async (req, res) => {
  const chain: Array<{
    id: string; projectId: string | null; parentId: string | null; title: string;
    description: string; status: string | null; priority: string | null; estimatedMinutes: number | null;
    tags: unknown; createdAt: Date; dueDate: Date | null; scheduledDate: Date | null;
    completedAt: Date | null; repeatRule: unknown | null;
  }> = [];
  const visited = new Set<string>();
  let currentId = req.params.id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = await prisma.todo.findUnique({ where: { id: currentId } });
    if (!todo) break;

    const incomingSource = await prisma.todoRelation.findFirst({
      where: { toTodoId: currentId, type: 'source_from' },
    });

    chain.unshift(todo);
    currentId = incomingSource?.fromTodoId ?? '';
  }

  res.json(chain);
});

export default router;
