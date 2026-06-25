import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const pluses = await db.select().from(schema.pluse).orderBy(desc(schema.pluse.createdAt));
  res.json(pluses);
});

router.get('/:id', async (req, res) => {
  const [pluse] = await db.select().from(schema.pluse).where(eq(schema.pluse.id, req.params.id)).limit(1);
  if (!pluse) return res.status(404).json({ error: 'Pluse not found' });
  res.json(pluse);
});

router.post('/', async (req, res) => {
  const { name, intervals, repeatCount, description, intervalTodos, autoAdvance } = req.body;
  const [pluse] = await db.insert(schema.pluse).values({
    name,
    description: description ?? '',
    intervals: intervals ?? [1500],
    repeatCount: repeatCount ?? 1,
    intervalTodos: intervalTodos ?? undefined,
    autoAdvance: autoAdvance ?? true,
  }).returning();
  await logChange(req, 'pluse', 'create', pluse.id, pluse);
  res.status(201).json(pluse);
});

router.patch('/:id', async (req, res) => {
  const [pluse] = await db.update(schema.pluse).set(req.body).where(eq(schema.pluse.id, req.params.id)).returning();
  await logChange(req, 'pluse', 'update', pluse.id, pluse);
  res.json(pluse);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await db.delete(schema.pluse).where(eq(schema.pluse.id, id));
  await logChange(req, 'pluse', 'delete', id);
  res.status(204).send();
});

export default router;
