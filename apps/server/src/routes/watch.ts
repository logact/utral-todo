import { Router } from 'express';
import { eq, and, gte, lt, inArray, asc, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
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
      db.select({
        id: schema.todo.id,
        title: schema.todo.title,
        status: schema.todo.status,
        estimatedMinutes: schema.todo.estimatedMinutes,
      }).from(schema.todo).where(
        and(gte(schema.todo.scheduledDate, today), lt(schema.todo.scheduledDate, tomorrow))
      ).orderBy(asc(schema.todo.order)),
      getVirtualTodosForDate(today),
    ]);

    const allTodos = [...realTodos, ...virtualTodos];

    const watchTodos: WatchTodo[] = allTodos.map((t) => ({
      id: t.id,
      title: t.title,
      status: (t.status ?? 'pending') as WatchTodo['status'],
      projectColor: '#6366f1',
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
    const todo = (await db.update(schema.todo).set({ status: 'done', completedAt: new Date() }).where(eq(schema.todo.id, id)).returning())[0];
    await logChange(req, 'todo', 'update', todo.id, todo);

    const todoLog = (await db.insert(schema.todoLog).values({
      todoId: id,
      type: 'system',
      content: 'Marked as done from Apple Watch',
    }).returning())[0];
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
    const session = (await db.select().from(schema.timerSession).where(
      inArray(schema.timerSession.status, ['running', 'paused'])
    ).orderBy(desc(schema.timerSession.startedAt)).limit(1))[0];

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
    const session = (await db.select().from(schema.timerSession).where(eq(schema.timerSession.id, id)).limit(1))[0];
    if (!session) {
      return res.status(404).json({ error: 'Timer session not found' });
    }

    if (session.status === 'running') {
      // Pause: add elapsed time since start
      const sinceStart = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
      const updated = (await db.update(schema.timerSession).set({
        status: 'paused',
        pausedAt: new Date(),
        elapsedSeconds: session.elapsedSeconds + sinceStart,
      }).where(eq(schema.timerSession.id, id)).returning())[0];
      await logChange(req, 'timerSession', 'update', updated.id, updated);
      res.json({ id: updated.id, status: updated.status, elapsedSeconds: updated.elapsedSeconds });
    } else {
      // Resume from paused
      const updated = (await db.update(schema.timerSession).set({
        status: 'running',
        startedAt: new Date(),
        pausedAt: null,
      }).where(eq(schema.timerSession.id, id)).returning())[0];
      await logChange(req, 'timerSession', 'update', updated.id, updated);
      res.json({ id: updated.id, status: updated.status, elapsedSeconds: updated.elapsedSeconds });
    }
  } catch (err) {
    console.error('Watch timer toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle timer', details: String(err) });
  }
});

export default router;
