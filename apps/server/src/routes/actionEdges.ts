import { Router } from 'express';
import { eq, or, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logChange } from '../sync/log.js';

const router = Router();

router.get('/', async (_req, res) => {
  const edges = await db.select().from(schema.actionEdge);
  res.json(edges);
});

router.get('/todo/:todoId', async (req, res) => {
  const todoId = req.params.todoId;
  const edges = await db.select().from(schema.actionEdge).where(
    or(eq(schema.actionEdge.fromTodoId, todoId), eq(schema.actionEdge.toTodoId, todoId)),
  );
  res.json(edges);
});

router.post('/', async (req, res) => {
  const { fromTodoId, toTodoId, type } = req.body;
  if (fromTodoId === toTodoId) {
    return res.status(400).json({ error: 'Cannot create an edge from a todo to itself' });
  }
  const [existing] = await db.select().from(schema.actionEdge)
    .where(and(eq(schema.actionEdge.fromTodoId, fromTodoId), eq(schema.actionEdge.toTodoId, toTodoId), eq(schema.actionEdge.type, type)))
    .limit(1);
  if (existing) {
    return res.status(409).json({ error: 'This edge already exists' });
  }
  const [edge] = await db.insert(schema.actionEdge).values({ fromTodoId, toTodoId, type }).returning();
  await logChange(req, 'actionEdge', 'create', edge.id, edge);
  res.status(201).json(edge);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await db.delete(schema.actionEdge).where(eq(schema.actionEdge.id, id));
  await logChange(req, 'actionEdge', 'delete', id);
  res.status(204).send();
});

export default router;
