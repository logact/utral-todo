import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logChange } from '../sync/log.js';

const router = Router();

function parsePlanRecord<T extends { nodeIds: unknown; edgeIds: unknown }>(
  record: T
): Omit<T, 'nodeIds' | 'edgeIds'> & { nodeIds: string[]; edgeIds: string[] } {
  return {
    ...record,
    nodeIds: typeof record.nodeIds === 'string' ? JSON.parse(record.nodeIds) : (record.nodeIds as string[]) ?? [],
    edgeIds: typeof record.edgeIds === 'string' ? JSON.parse(record.edgeIds) : (record.edgeIds as string[]) ?? [],
  };
}

// GET /api/plans — list all plans
router.get('/', async (_req, res) => {
  try {
    const plans = await db.select().from(schema.plan);
    res.json(plans.map(parsePlanRecord));
  } catch (err) {
    console.error('[plans] Failed to list plans:', err);
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

// GET /api/plans/goal/:goalTodoId — plans for a specific goal
router.get('/goal/:goalTodoId', async (req, res) => {
  try {
    const plans = await db.select().from(schema.plan).where(eq(schema.plan.goalTodoId, req.params.goalTodoId));
    res.json(plans.map(parsePlanRecord));
  } catch (err) {
    console.error('[plans] Failed to list plans for goal:', err);
    res.status(500).json({ error: 'Failed to list plans for goal' });
  }
});

// GET /api/plans/:id — single plan
router.get('/:id', async (req, res) => {
  try {
    const plan = (await db.select().from(schema.plan).where(eq(schema.plan.id, req.params.id)).limit(1))[0];
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(parsePlanRecord(plan));
  } catch (err) {
    console.error('[plans] Failed to get plan:', err);
    res.status(500).json({ error: 'Failed to get plan' });
  }
});

// POST /api/plans — create a plan
router.post('/', async (req, res) => {
  try {
    const { goalTodoId, title, nodeIds = [], edgeIds = [], isSystemPlan = false } = req.body;
    if (!goalTodoId || !title) {
      return res.status(400).json({ error: 'goalTodoId and title are required' });
    }
    const plan = (await db.insert(schema.plan).values({
      goalTodoId,
      title,
      nodeIds,
      edgeIds,
      isSystemPlan,
    }).returning())[0];
    const parsed = parsePlanRecord(plan);
    await logChange(req, 'plan', 'create', plan.id, parsed);
    res.status(201).json(parsed);
  } catch (err) {
    console.error('[plans] Failed to create plan:', err);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// PATCH /api/plans/:id — update a plan
router.patch('/:id', async (req, res) => {
  try {
    const { title, nodeIds, edgeIds, isSystemPlan } = req.body;
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (nodeIds !== undefined) data.nodeIds = nodeIds;
    if (edgeIds !== undefined) data.edgeIds = edgeIds;
    if (isSystemPlan !== undefined) data.isSystemPlan = isSystemPlan;
    data.updatedAt = new Date();

    const plan = (await db.update(schema.plan).set(data).where(eq(schema.plan.id, req.params.id)).returning())[0];
    const parsed = parsePlanRecord(plan);
    await logChange(req, 'plan', 'update', plan.id, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('[plans] Failed to update plan:', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// DELETE /api/plans/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.delete(schema.plan).where(eq(schema.plan.id, req.params.id));
    await logChange(req, 'plan', 'delete', req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[plans] Failed to delete plan:', err);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

export default router;
