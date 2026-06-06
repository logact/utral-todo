import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const pluses = await prisma.pluse.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(pluses);
});

router.get('/:id', async (req, res) => {
  const pluse = await prisma.pluse.findUnique({ where: { id: req.params.id } });
  if (!pluse) return res.status(404).json({ error: 'Pluse not found' });
  res.json(pluse);
});

router.post('/', async (req, res) => {
  const { name, intervals, repeatCount, description } = req.body;
  const pluse = await prisma.pluse.create({
    data: {
      name,
      description: description ?? '',
      intervals: intervals ?? [25],
      repeatCount: repeatCount ?? 1,
    },
  });
  await logChange(req, 'pluse', 'create', pluse.id, pluse);
  res.status(201).json(pluse);
});

router.patch('/:id', async (req, res) => {
  const pluse = await prisma.pluse.update({
    where: { id: req.params.id },
    data: req.body,
  });
  await logChange(req, 'pluse', 'update', pluse.id, pluse);
  res.json(pluse);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.pluse.delete({ where: { id } });
  await logChange(req, 'pluse', 'delete', id);
  res.status(204).send();
});

export default router;
