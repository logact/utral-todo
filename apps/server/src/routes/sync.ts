import { Router } from 'express';
import { eq } from 'drizzle-orm';
import type { SyncPayload, SyncEvent, HLCTimestamp } from '@utral/types';
import { db, schema } from '../db/index.js';
import { syncHandler } from '../sync/setup.js';

const router = Router();

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

function parseHLC(value: unknown): HLCTimestamp {
  if (!value) return { wall: 0, counter: 0, node: '' };
  if (typeof value === 'object' && value !== null && 'wall' in value) {
    return value as HLCTimestamp;
  }
  if (typeof value === 'string') {
    const parts = value.split(':');
    if (parts.length === 3) {
      return { wall: Number(parts[0]), counter: Number(parts[1]), node: parts[2] };
    }
  }
  return { wall: 0, counter: 0, node: '' };
}

// POST /api/sync/push — unified push endpoint for sync engine
router.post('/push', async (req, res) => {
  const { deviceId, changes } = req.body as { deviceId: string; changes: SyncEvent[] };

  if (!deviceId || !Array.isArray(changes)) {
    return res.status(400).json({ error: 'Invalid request: deviceId and changes array required' });
  }

  try {
    const parsed = changes.map((e) => ({ ...e, createdAt: parseHLC(e.createdAt) }));
    const result = await syncHandler.acceptPush(deviceId, parsed);
    res.json(result);
  } catch (err) {
    console.error('Sync push error:', err);
    res.status(500).json({ error: 'Sync push failed', details: String(err) });
  }
});

// GET /api/sync/stream — SSE endpoint for real-time push
router.get('/stream', async (req, res) => {
  const token = req.query.token as string | undefined;
  const deviceId = req.query.deviceId as string | undefined;
  const since = req.query.since as string | undefined;

  const API_TOKEN = process.env.API_TOKEN;
  if (API_TOKEN) {
    if (!token || token !== API_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const conn = {
    write(data: string) { res.write(data); },
    onClose(cb: () => void) { res.on('close', cb); },
  };

  // Send initial delta
  if (since) {
    await syncHandler.sendInitialDelta(deviceId, conn, new Date(since));
  }

  // Register for future broadcasts
  syncHandler.subscribe(deviceId, conn);
});

// POST /api/sync/events — fallback poll endpoint
router.post('/events', async (req, res) => {
  const { since } = req.body as { since?: string };
  if (!since) {
    return res.status(400).json({ error: 'since is required' });
  }

  try {
    const events = await syncHandler.getEventsSince(new Date(since));
    res.json({ events });
  } catch (err) {
    console.error('Sync events error:', err);
    res.status(500).json({ error: 'Failed to fetch events', details: String(err) });
  }
});

// Legacy endpoints — kept for backward compatibility

// POST /api/sync — receive data from client, merge into database
router.post('/', async (req, res) => {
  const payload = req.body as SyncPayload;
  const accepted: Partial<Record<keyof SyncPayload, number>> = {};
  const deviceId = (req.body as Record<string, unknown>).deviceId as string | undefined;

  console.log(`[sync] Legacy push from ${deviceId || 'unknown device'}:`, {
    todos: payload.todos?.length ?? 0,
    relations: payload.relations?.length ?? 0,
    todoLogs: payload.todoLogs?.length ?? 0,
    actionEdges: payload.actionEdges?.length ?? 0,
    pluses: payload.pluses?.length ?? 0,
    timerSessions: payload.timerSessions?.length ?? 0,
    repeatOccurrences: payload.repeatOccurrences?.length ?? 0,
    plans: payload.plans?.length ?? 0,
  });

  try {
    await db.transaction(async (tx) => {
      // Merge todos
      if (payload.todos?.length) {
        let count = 0;
        for (const item of payload.todos) {
          const id = item.id as string;
          const data = {
            id,
            title: item.title as string,
            description: (item.description as string) || '',
            status: item.status as string,
            priority: item.priority as string,
            estimatedMinutes: (item.estimatedMinutes as number) ?? 60,
            tags: (item.tags as string[]) ?? [],
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
            dueDate: toDate(item.dueDate),
            scheduledDate: toDate(item.scheduledDate),
            scheduledEndDate: toDate(item.scheduledEndDate),
            startedAt: toDate(item.startedAt),
            completedAt: toDate(item.completedAt),
            repeatRule: item.repeatRule ?? null,
            order: (item.order as number) ?? 0,
            parentId: (item.parentId as string) || null,
          };

          const existingRows = await tx.select().from(schema.todo).where(eq(schema.todo.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.todo).set(data).where(eq(schema.todo.id, id));
          } else {
            await tx.insert(schema.todo).values(data);
          }
          count++;
        }
        accepted.todos = count;
      }

      // Merge relations
      if (payload.relations?.length) {
        let count = 0;
        for (const item of payload.relations) {
          const id = item.id as string;
          const data = {
            id,
            fromTodoId: item.fromTodoId as string,
            toTodoId: item.toTodoId as string,
            type: item.type as string,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.todoRelation).where(eq(schema.todoRelation.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.todoRelation).set(data).where(eq(schema.todoRelation.id, id));
          } else {
            await tx.insert(schema.todoRelation).values(data);
          }
          count++;
        }
        accepted.relations = count;
      }

      // Merge todoLogs
      if (payload.todoLogs?.length) {
        let count = 0;
        for (const item of payload.todoLogs) {
          const id = item.id as string;
          const data = {
            id,
            todoId: item.todoId as string,
            type: item.type as string,
            content: item.content as string,
            minutesSpent: (item.minutesSpent as number) || null,
            metadata: item.metadata ?? null,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.todoLog).where(eq(schema.todoLog.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.todoLog).set(data).where(eq(schema.todoLog.id, id));
          } else {
            await tx.insert(schema.todoLog).values(data);
          }
          count++;
        }
        accepted.todoLogs = count;
      }

      // Merge actionEdges
      if (payload.actionEdges?.length) {
        let count = 0;
        for (const item of payload.actionEdges) {
          const id = item.id as string;
          const data = {
            id,
            fromTodoId: item.fromTodoId as string,
            toTodoId: item.toTodoId as string,
            type: item.type as string,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.actionEdge).where(eq(schema.actionEdge.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.actionEdge).set(data).where(eq(schema.actionEdge.id, id));
          } else {
            await tx.insert(schema.actionEdge).values(data);
          }
          count++;
        }
        accepted.actionEdges = count;
      }

      // Merge pluses
      if (payload.pluses?.length) {
        let count = 0;
        for (const item of payload.pluses) {
          const id = item.id as string;
          const data = {
            id,
            name: item.name as string,
            description: (item.description as string) || '',
            intervals: item.intervals ?? [1500],
            repeatCount: (item.repeatCount as number) ?? 1,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.pluse).where(eq(schema.pluse.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.pluse).set(data).where(eq(schema.pluse.id, id));
          } else {
            await tx.insert(schema.pluse).values(data);
          }
          count++;
        }
        accepted.pluses = count;
      }

      // Merge timerSessions
      if (payload.timerSessions?.length) {
        let count = 0;
        for (const item of payload.timerSessions) {
          const id = item.id as string;
          const data = {
            id,
            type: item.type as string,
            name: item.name as string,
            pluseId: (item.pluseId as string) || null,
            todoId: (item.todoId as string) || null,
            intervals: item.intervals ?? null,
            repeatCount: (item.repeatCount as number) ?? 1,
            startedAt: toDate(item.startedAt) ?? new Date(),
            pausedAt: toDate(item.pausedAt),
            completedAt: toDate(item.completedAt),
            currentIndex: (item.currentIndex as number) ?? 0,
            elapsedSeconds: (item.elapsedSeconds as number) ?? 0,
            status: (item.status as string) || 'running',
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.timerSession).where(eq(schema.timerSession.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.timerSession).set(data).where(eq(schema.timerSession.id, id));
          } else {
            await tx.insert(schema.timerSession).values(data);
          }
          count++;
        }
        accepted.timerSessions = count;
      }

      // Merge repeatOccurrences
      if (payload.repeatOccurrences?.length) {
        let count = 0;
        for (const item of payload.repeatOccurrences) {
          const id = item.id as string;
          const data = {
            id,
            templateId: item.templateId as string,
            date: toDate(item.date) ?? new Date(),
            status: item.status as string,
            completedAt: toDate(item.completedAt),
            materializedTodoId: (item.materializedTodoId as string) || null,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.repeatOccurrence).where(eq(schema.repeatOccurrence.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.repeatOccurrence).set(data).where(eq(schema.repeatOccurrence.id, id));
          } else {
            await tx.insert(schema.repeatOccurrence).values(data);
          }
          count++;
        }
        accepted.repeatOccurrences = count;
      }
      // Merge plans
      if (payload.plans?.length) {
        let count = 0;
        for (const raw of payload.plans) {
          const item = raw as unknown as Record<string, unknown>;
          const id = item.id as string;
          const nodeIds = (item.nodeIds as string[]) ?? (item.todoIds as string[]) ?? [];
          const edgeIds = (item.edgeIds as string[]) ?? [];
          const data = {
            id,
            goalTodoId: item.goalTodoId as string,
            title: item.title as string,
            nodeIds,
            edgeIds,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existingRows = await tx.select().from(schema.plan).where(eq(schema.plan.id, id)).limit(1);
          if (existingRows[0]) {
            await tx.update(schema.plan).set(data).where(eq(schema.plan.id, id));
          } else {
            await tx.insert(schema.plan).values(data);
          }
          count++;
        }
        accepted.plans = count;
      }
    });

    console.log('[sync] Legacy push accepted:', accepted);
    res.json({ accepted });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed', details: String(err) });
  }
});

// GET /api/sync — return all data for client to pull
router.get('/', async (_req, res) => {
  console.log('[sync] Legacy pull request');
  try {
    const todos = await db.select().from(schema.todo);
    const relations = await db.select().from(schema.todoRelation);
    const todoLogs = await db.select().from(schema.todoLog);
    const actionEdges = await db.select().from(schema.actionEdge);
    const pluses = await db.select().from(schema.pluse);
    const timerSessions = await db.select().from(schema.timerSession);
    const repeatOccurrences = await db.select().from(schema.repeatOccurrence);
    const plans = await db.select().from(schema.plan);

    res.json({
      todos,
      relations,
      todoLogs,
      actionEdges,
      pluses,
      timerSessions,
      repeatOccurrences,
      plans: plans.map((p) => ({
        ...p,
        // Temporary: keep todoIds for old desktop clients during transition
        todoIds: p.nodeIds ?? [],
      })),
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    res.status(500).json({ error: 'Failed to fetch data', details: String(err) });
  }
});

router.post('/gc', async (_req, res) => {
  try {
    const deleted = await syncHandler.garbageCollectTombstones();
    res.json({ deleted });
  } catch (err) {
    console.error('Tombstone GC error:', err);
    res.status(500).json({ error: 'GC failed', details: String(err) });
  }
});

export default router;
