import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (req, res) => {
  const { todoId } = req.query;
  const logs = await prisma.todoLog.findMany({
    where: todoId ? { todoId: String(todoId) } : undefined,
    orderBy: { createdAt: 'asc' },
  });
  res.json(logs);
});

router.post('/', async (req, res) => {
  const { todoId, type, content, minutesSpent, metadata } = req.body;
  const log = await prisma.todoLog.create({
    data: {
      todoId,
      type,
      content,
      minutesSpent: minutesSpent ?? null,
      metadata: metadata ?? null,
    },
  });
  await logChange(req, 'todoLog', 'create', log.id, log);
  res.status(201).json(log);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.todoLog.delete({ where: { id } });
  await logChange(req, 'todoLog', 'delete', id);
  res.status(204).send();
});

export default router;
