import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';
import { getVirtualTodosForDate } from '../lib/virtualTodos.js';
import type { MobileTodo, MobileTodayResponse } from '@utral/types';

const router = Router();

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// GET /api/mobile/today — Today's todos with project info inlined
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
      }),
      getVirtualTodosForDate(today),
    ]);

    const allTodos = [...realTodos, ...virtualTodos];

    const mobileTodos: MobileTodo[] = allTodos.map((t) => ({
      id: t.id,
      title: t.title,
      status: (t.status ?? 'pending') as MobileTodo['status'],
      priority: (t.priority ?? 'medium') as MobileTodo['priority'],
      estimatedMinutes: t.estimatedMinutes ?? 60,
      scheduledDate: t.scheduledDate ?? undefined,
      dueDate: t.dueDate ?? undefined,
      order: t.order,
    }));

    const response: MobileTodayResponse = { todos: mobileTodos };
    res.json(response);
  } catch (err) {
    console.error('Mobile today error:', err);
    res.status(500).json({ error: 'Failed to fetch today', details: String(err) });
  }
});

// GET /api/mobile/inbox — Unscheduled non-done todos
router.get('/inbox', async (_req, res) => {
  try {
    const todos = await prisma.todo.findMany({
      where: {
        scheduledDate: null,
        status: { not: 'done' },
      },
      orderBy: { order: 'asc' },
    });

    const mobileTodos: MobileTodo[] = todos.map((t) => ({
      id: t.id,
      title: t.title,
      status: (t.status ?? 'pending') as MobileTodo['status'],
      priority: (t.priority ?? 'medium') as MobileTodo['priority'],
      estimatedMinutes: t.estimatedMinutes ?? 60,
      scheduledDate: t.scheduledDate ?? undefined,
      dueDate: t.dueDate ?? undefined,
      order: t.order,
    }));

    res.json({ todos: mobileTodos });
  } catch (err) {
    console.error('Mobile inbox error:', err);
    res.status(500).json({ error: 'Failed to fetch inbox', details: String(err) });
  }
});

// POST /api/mobile/todos/quick — Minimal todo creation
router.post('/todos/quick', async (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const maxOrder = await prisma.todo.aggregate({ _max: { order: true } });
    const todo = await prisma.todo.create({
      data: {
        nodeType: 'task',
        title,
        description: '',
        status: 'pending',
        priority: 'medium',
        estimatedMinutes: 60,
        tags: [],
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });
    await logChange(req, 'todo', 'create', todo.id, todo);
    res.status(201).json(todo);
  } catch (err) {
    console.error('Quick create error:', err);
    res.status(500).json({ error: 'Failed to create todo', details: String(err) });
  }
});

// POST /api/mobile/todos/:id/complete — One-tap mark done
router.post('/todos/:id/complete', async (req, res) => {
  const { id } = req.params;
  try {
    const todo = await prisma.todo.update({
      where: { id },
      data: { status: 'done', completedAt: new Date() },
    });
    await logChange(req, 'todo', 'update', todo.id, todo);

    // Also log it
    const todoLog = await prisma.todoLog.create({
      data: {
        todoId: id,
        type: 'system',
        content: 'Marked as done from mobile app',
      },
    });
    await logChange(req, 'todoLog', 'create', todoLog.id, todoLog);

    res.json(todo);
  } catch (err) {
    console.error('Mobile complete error:', err);
    res.status(500).json({ error: 'Failed to complete todo', details: String(err) });
  }
});

// POST /api/mobile/todos/:id/start — Start a todo
router.post('/todos/:id/start', async (req, res) => {
  const { id } = req.params;
  try {
    const todo = await prisma.todo.update({
      where: { id },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    await logChange(req, 'todo', 'update', todo.id, todo);
    res.json(todo);
  } catch (err) {
    console.error('Mobile start error:', err);
    res.status(500).json({ error: 'Failed to start todo', details: String(err) });
  }
});

export default router;
