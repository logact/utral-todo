import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';
import { getVirtualTodosForDate } from '../lib/virtualTodos.js';
import type { WatchTodo, WatchTodayResponse } from '@utral/types';

const router = Router();

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// GET /api/watch/today — Ultra-minimal today view for watch
router.get('/today', async (_req, res) => {
  try {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [realTodos, virtualTodos] = await Promise.all([
      prisma.todo.findMany({
        where: {
          scheduledDate: { gte: today, lt: tomorrow },
        },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          estimatedMinutes: true,
          projectId: true,
        },
      }),
      getVirtualTodosForDate(today),
    ]);

    const allTodos = [...realTodos, ...virtualTodos];

    const projectIds = [...new Set(allTodos.map((t) => t.projectId).filter(Boolean))];
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds as string[] } },
      select: { id: true, color: true },
    });
    const projectMap = new Map(projects.map((p) => [p.id, p.color]));

    const watchTodos: WatchTodo[] = allTodos.map((t) => ({
      id: t.id,
      title: t.title,
      status: (t.status ?? 'pending') as WatchTodo['status'],
      projectColor: (t.projectId ? projectMap.get(t.projectId) : '#6366f1') ?? '#6366f1',
      estimatedMinutes: t.estimatedMinutes ?? 60,
    }));

    const response: WatchTodayResponse = { todos: watchTodos };
    res.json(response);
  } catch (err) {
    console.error('Watch today error:', err);
    res.status(500).json({ error: 'Failed to fetch watch today', details: String(err) });
  }
});

// POST /api/watch/todos/:id/complete — Mark done from watch
router.post('/todos/:id/complete', async (req, res) => {
  const { id } = req.params;
  try {
    const todo = await prisma.todo.update({
      where: { id },
      data: { status: 'done', completedAt: new Date() },
    });
    await logChange(req, 'todo', 'update', todo.id, todo);

    const todoLog = await prisma.todoLog.create({
      data: {
        todoId: id,
        type: 'system',
        content: 'Marked as done from Apple Watch',
      },
    });
    await logChange(req, 'todoLog', 'create', todoLog.id, todoLog);

    res.json({ id: todo.id, status: todo.status });
  } catch (err) {
    console.error('Watch complete error:', err);
    res.status(500).json({ error: 'Failed to complete todo', details: String(err) });
  }
});

// GET /api/watch/timer — Active running timer
router.get('/timer', async (_req, res) => {
  try {
    const session = await prisma.timerSession.findFirst({
      where: { status: { in: ['running', 'paused'] } },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      return res.json({ active: false });
    }

    // Compute elapsed seconds server-side
    let elapsed = session.elapsedSeconds;
    if (session.status === 'running' && session.startedAt) {
      const sinceStart = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
      elapsed += sinceStart;
    }

    res.json({
      active: true,
      session: {
        id: session.id,
        name: session.name,
        type: session.type,
        status: session.status,
        elapsedSeconds: elapsed,
        currentIndex: session.currentIndex,
        intervals: session.intervals,
        repeatCount: session.repeatCount,
      },
    });
  } catch (err) {
    console.error('Watch timer error:', err);
    res.status(500).json({ error: 'Failed to fetch timer', details: String(err) });
  }
});

// POST /api/watch/timer/:id/toggle — Start or pause timer
router.post('/timer/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    const session = await prisma.timerSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Timer session not found' });
    }

    if (session.status === 'running') {
      // Pause: add elapsed time since start
      const sinceStart = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
      const updated = await prisma.timerSession.update({
        where: { id },
        data: {
          status: 'paused',
          pausedAt: new Date(),
          elapsedSeconds: session.elapsedSeconds + sinceStart,
        },
      });
      await logChange(req, 'timerSession', 'update', updated.id, updated);
      res.json({ id: updated.id, status: updated.status, elapsedSeconds: updated.elapsedSeconds });
    } else {
      // Resume from paused
      const updated = await prisma.timerSession.update({
        where: { id },
        data: {
          status: 'running',
          startedAt: new Date(),
          pausedAt: null,
        },
      });
      await logChange(req, 'timerSession', 'update', updated.id, updated);
      res.json({ id: updated.id, status: updated.status, elapsedSeconds: updated.elapsedSeconds });
    }
  } catch (err) {
    console.error('Watch timer toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle timer', details: String(err) });
  }
});

export default router;
