import { Router } from 'express';
import { prisma } from '../index.js';

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
  res.status(201).json(roadmap);
});

router.patch('/:id', async (req, res) => {
  const { phases } = req.body;
  const roadmap = await prisma.roadmap.update({
    where: { id: req.params.id },
    data: { phases: phases ?? undefined },
  });
  res.json(roadmap);
});

router.delete('/:id', async (req, res) => {
  await prisma.roadmap.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
