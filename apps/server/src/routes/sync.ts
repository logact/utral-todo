import { Router } from 'express';
import { Prisma } from '@prisma/client';
import type { SyncPayload, SyncEvent } from '@utral/types';
import { prisma } from '../index.js';
import { broadcast, createSyncEvent, applyChange, getEventsSince } from '../sync/broadcaster.js';

const router = Router();

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

// POST /api/sync/push — unified push endpoint for sync engine
router.post('/push', async (req, res) => {
  const { deviceId, changes } = req.body as { deviceId: string; changes: SyncEvent[] };
  const accepted: string[] = [];
  const rejected: Array<{ recordId: string; reason: string }> = [];

  if (!deviceId || !Array.isArray(changes)) {
    return res.status(400).json({ error: 'Invalid request: deviceId and changes array required' });
  }

  try {
    for (const event of changes) {
      try {
        await applyChange(event);
        const logged = await createSyncEvent(
          event.table,
          event.operation,
          event.recordId,
          event.payload,
          deviceId
        );
        broadcast(logged, deviceId);
        accepted.push(event.recordId);
      } catch (err) {
        console.error(`[sync] Failed to apply change for ${event.table}/${event.recordId}:`, err);
        rejected.push({ recordId: event.recordId, reason: String(err) });
      }
    }

    res.json({ accepted: accepted.length, rejected });
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

  // Send initial delta
  try {
    if (since) {
      const sinceDate = new Date(since);
      const events = await getEventsSince(sinceDate);
      if (events.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'delta', events })}\n\n`);
      }
    }
  } catch (err) {
    console.error('[sync] Failed to send initial delta:', err);
  }

  // Register for broadcasts
  const { subscribe } = await import('../sync/broadcaster.js');
  subscribe(deviceId, res);
});

// POST /api/sync/events — fallback poll endpoint
router.post('/events', async (req, res) => {
  const { since } = req.body as { since?: string };
  if (!since) {
    return res.status(400).json({ error: 'since is required' });
  }

  try {
    const events = await getEventsSince(new Date(since));
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

  try {
    await prisma.$transaction(async (tx) => {
      // Merge todos
      if (payload.todos?.length) {
        let count = 0;
        for (const item of payload.todos) {
          const id = item.id as string;
          const data = {
            id,
            title: item.title as string,
            description: (item.description as string) || '',
            instructions: (item.instructions as string) || '',
            status: item.status as string,
            priority: item.priority as string,
            estimatedMinutes: (item.estimatedMinutes as number) ?? 60,
            tags: JSON.stringify(item.tags ?? []),
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
            dueDate: toDate(item.dueDate),
            scheduledDate: toDate(item.scheduledDate),
            startedAt: toDate(item.startedAt),
            completedAt: toDate(item.completedAt),
            repeatRule: item.repeatRule ? JSON.stringify(item.repeatRule) : Prisma.DbNull,
            order: (item.order as number) ?? 0,
            isGoal: (item.isGoal as boolean) ?? false,
            projectId: (item.projectId as string) || null,
            parentId: (item.parentId as string) || null,
          };

          const existing = await tx.todo.findUnique({ where: { id } });
          if (existing) {
            await tx.todo.update({ where: { id }, data });
          } else {
            await tx.todo.create({ data: data as unknown as Parameters<typeof tx.todo.create>[0]['data'] });
          }
          count++;
        }
        accepted.todos = count;
      }

      // Merge projects
      if (payload.projects?.length) {
        let count = 0;
        for (const item of payload.projects) {
          const id = item.id as string;
          const data = {
            id,
            title: item.title as string,
            description: (item.description as string) || '',
            status: (item.status as string) || 'active',
            color: (item.color as string) || '#6366f1',
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
            deadline: toDate(item.deadline),
          };

          const existing = await tx.project.findUnique({ where: { id } });
          if (existing) {
            await tx.project.update({ where: { id }, data });
          } else {
            await tx.project.create({ data });
          }
          count++;
        }
        accepted.projects = count;
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

          const existing = await tx.todoRelation.findUnique({ where: { id } });
          if (existing) {
            await tx.todoRelation.update({ where: { id }, data });
          } else {
            await tx.todoRelation.create({ data });
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
            metadata: item.metadata ? JSON.stringify(item.metadata) : Prisma.DbNull,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existing = await tx.todoLog.findUnique({ where: { id } });
          if (existing) {
            await tx.todoLog.update({ where: { id }, data });
          } else {
            await tx.todoLog.create({ data });
          }
          count++;
        }
        accepted.todoLogs = count;
      }

      // Merge roadmaps
      if (payload.roadmaps?.length) {
        let count = 0;
        for (const item of payload.roadmaps) {
          const id = item.id as string;
          const data = {
            id,
            goalTodoId: item.goalTodoId as string,
            phases: JSON.stringify(item.phases ?? []),
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existing = await tx.roadmap.findUnique({ where: { id } });
          if (existing) {
            await tx.roadmap.update({ where: { id }, data });
          } else {
            await tx.roadmap.create({ data });
          }
          count++;
        }
        accepted.roadmaps = count;
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

          const existing = await tx.actionEdge.findUnique({ where: { id } });
          if (existing) {
            await tx.actionEdge.update({ where: { id }, data });
          } else {
            await tx.actionEdge.create({ data });
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
            intervals: JSON.stringify(item.intervals ?? [1500]),
            repeatCount: (item.repeatCount as number) ?? 1,
            createdAt: toDate(item.createdAt) ?? new Date(),
            updatedAt: toDate(item.updatedAt) ?? new Date(),
          };

          const existing = await tx.pluse.findUnique({ where: { id } });
          if (existing) {
            await tx.pluse.update({ where: { id }, data });
          } else {
            await tx.pluse.create({ data });
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
            intervals: item.intervals ? JSON.stringify(item.intervals) : Prisma.DbNull,
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

          const existing = await tx.timerSession.findUnique({ where: { id } });
          if (existing) {
            await tx.timerSession.update({ where: { id }, data });
          } else {
            await tx.timerSession.create({ data });
          }
          count++;
        }
        accepted.timerSessions = count;
      }
    });

    res.json({ accepted });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed', details: String(err) });
  }
});

// GET /api/sync — return all data for client to pull
router.get('/', async (_req, res) => {
  try {
    const todos = await prisma.todo.findMany();
    const projects = await prisma.project.findMany();
    const relations = await prisma.todoRelation.findMany();
    const todoLogs = await prisma.todoLog.findMany();
    const roadmaps = await prisma.roadmap.findMany();
    const actionEdges = await prisma.actionEdge.findMany();
    const pluses = await prisma.pluse.findMany();
    const timerSessions = await prisma.timerSession.findMany();

    res.json({
      todos: todos.map((t) => ({
        ...t,
        tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
        repeatRule: typeof t.repeatRule === 'string' ? JSON.parse(t.repeatRule) : t.repeatRule,
      })),
      projects,
      relations,
      todoLogs: todoLogs.map((l) => ({
        ...l,
        metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata) : l.metadata,
      })),
      roadmaps: roadmaps.map((r) => ({
        ...r,
        phases: typeof r.phases === 'string' ? JSON.parse(r.phases) : r.phases,
      })),
      actionEdges,
      pluses: pluses.map((p) => ({
        ...p,
        intervals: typeof p.intervals === 'string' ? JSON.parse(p.intervals) : p.intervals,
      })),
      timerSessions: timerSessions.map((s) => ({
        ...s,
        intervals: typeof s.intervals === 'string' ? JSON.parse(s.intervals) : s.intervals,
      })),
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    res.status(500).json({ error: 'Failed to fetch data', details: String(err) });
  }
});

export default router;
