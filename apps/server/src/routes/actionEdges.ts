import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const edges = await prisma.actionEdge.findMany();
  res.json(edges);
});

router.get('/todo/:todoId', async (req, res) => {
  const todoId = req.params.todoId;
  const edges = await prisma.actionEdge.findMany({
    where: {
      OR: [{ fromTodoId: todoId }, { toTodoId: todoId }],
    },
  });
  res.json(edges);
});

router.post('/', async (req, res) => {
  const { fromTodoId, toTodoId, type } = req.body;
  if (fromTodoId === toTodoId) {
    return res.status(400).json({ error: 'Cannot create an edge from a todo to itself' });
  }
  const existing = await prisma.actionEdge.findFirst({
    where: { fromTodoId, toTodoId, type },
  });
  if (existing) {
    return res.status(409).json({ error: 'This edge already exists' });
  }
  const edge = await prisma.actionEdge.create({
    data: { fromTodoId, toTodoId, type },
  });
  await logChange(req, 'actionEdge', 'create', edge.id, edge);
  res.status(201).json(edge);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.actionEdge.delete({ where: { id } });
  await logChange(req, 'actionEdge', 'delete', id);
  res.status(204).send();
});

export default router;
