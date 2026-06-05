import { Router } from 'express';
import { prisma } from '../index.js';

const router = Router();

router.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(projects);
});

router.post('/', async (req, res) => {
  const { title, description, color, deadline } = req.body;
  const project = await prisma.project.create({
    data: {
      title,
      description: description ?? '',
      color,
      status: 'active',
      deadline: deadline ? new Date(deadline) : null,
    },
  });
  res.status(201).json(project);
});

router.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.patch('/:id', async (req, res) => {
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(project);
});

router.delete('/:id', async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
