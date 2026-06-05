import { Router } from 'express';
import { prisma } from '../index.js';

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
  res.status(201).json(log);
});

router.delete('/:id', async (req, res) => {
  await prisma.todoLog.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
