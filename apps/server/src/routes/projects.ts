import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(projects);
});

router.post('/', async (req, res) => {
  const { title, description, color, deadline, mainGoalId } = req.body;
  const project = await prisma.project.create({
    data: {
      title,
      description: description ?? '',
      color,
      status: 'active',
      deadline: deadline ? new Date(deadline) : null,
      mainGoalId: mainGoalId || null,
    },
  });
  await logChange(req, 'project', 'create', project.id, project);
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
  await logChange(req, 'project', 'update', project.id, project);
  res.json(project);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.project.delete({ where: { id } });
  await logChange(req, 'project', 'delete', id);
  res.status(204).send();
});

export default router;
