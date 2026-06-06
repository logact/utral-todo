import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const roadmaps = await prisma.roadmap.findMany({ orderBy: { updatedAt: 'desc' } });
  res.json(roadmaps);
});

router.get('/goal/:goalTodoId', async (req, res) => {
  const roadmap = await prisma.roadmap.findUnique({ where: { goalTodoId: req.params.goalTodoId } });
  if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
  res.json(roadmap);
});

router.post('/', async (req, res) => {
  const { goalTodoId, phases } = req.body;
  const roadmap = await prisma.roadmap.create({
    data: {
      goalTodoId,
      phases: phases ?? [],
    },
  });
  await logChange(req, 'roadmap', 'create', roadmap.id, roadmap);
  res.status(201).json(roadmap);
});

router.patch('/:id', async (req, res) => {
  const { phases } = req.body;
  const roadmap = await prisma.roadmap.update({
    where: { id: req.params.id },
    data: { phases: phases ?? undefined },
  });
  await logChange(req, 'roadmap', 'update', roadmap.id, roadmap);
  res.json(roadmap);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.roadmap.delete({ where: { id } });
  await logChange(req, 'roadmap', 'delete', id);
  res.status(204).send();
});

export default router;
