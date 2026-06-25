import { Router } from 'express';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (req, res) => {
  const { todoId } = req.query;
  const logs = todoId
    ? await db.select().from(schema.todoLog).where(eq(schema.todoLog.todoId, String(todoId))).orderBy(asc(schema.todoLog.createdAt))
    : await db.select().from(schema.todoLog).orderBy(asc(schema.todoLog.createdAt));
  res.json(logs);
});

router.post('/', async (req, res) => {
  const { todoId, type, content, minutesSpent, metadata } = req.body;
  const [log] = await db.insert(schema.todoLog).values({
    todoId,
    type,
    content,
    minutesSpent: minutesSpent ?? null,
    metadata: metadata ?? null,
  }).returning();
  await logChange(req, 'todoLog', 'create', log.id, log);
  res.status(201).json(log);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await db.delete(schema.todoLog).where(eq(schema.todoLog.id, id));
  await logChange(req, 'todoLog', 'delete', id);
  res.status(204).send();
});

export default router;
