import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index.js';
import type { Todo } from '@prisma/client';

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getDate() === db.getDate() &&
    da.getMonth() === db.getMonth() &&
    da.getFullYear() === db.getFullYear()
  );
}

async function addIsGoal(todos: Todo[]): Promise<Array<Todo & { isGoal: boolean }>> {
  const roadmaps = await prisma.roadmap.findMany();
  const goalIds = new Set(roadmaps.map((r) => r.goalTodoId));
  return todos.map((t) => ({ ...t, isGoal: goalIds.has(t.id) }));
}

const router = Router();

router.get('/', async (req, res) => {
  const { projectId, parentId, root, date, tag, unscheduled, overdue, unassigned, repeatTemplates } = req.query;

  if (projectId) {
    const todos = await prisma.todo.findMany({ where: { projectId: String(projectId) }, orderBy: { order: 'asc' } });
    return res.json(todos);
  }

  if (parentId) {
    const todos = await prisma.todo.findMany({ where: { parentId: String(parentId) }, orderBy: { order: 'asc' } });
    return res.json(todos);
  }

  if (root === 'true') {
    const todos = await prisma.todo.findMany({ where: { parentId: null }, orderBy: { order: 'asc' } });
    return res.json(todos);
  }

  if (date) {
    const d = new Date(String(date));
    const start = startOfDay(d);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const todos = await prisma.todo.findMany({
      where: {
        scheduledDate: { gte: start, lt: end },
      },
      orderBy: { order: 'asc' },
    });
    return res.json(todos);
  }

  if (unscheduled === 'true') {
    const todos = await prisma.todo.findMany({
      where: {
        scheduledDate: null,
        status: { not: 'done' },
      },
      orderBy: { order: 'asc' },
    });
    return res.json(todos);
  }

  if (overdue === 'true') {
    const today = startOfDay(new Date());
    const todos = await prisma.todo.findMany({
      where: {
        status: { not: 'done' },
        dueDate: { lt: today },
      },
      orderBy: { order: 'asc' },
    });
    return res.json(todos);
  }

  if (unassigned === 'true') {
    const todos = await prisma.todo.findMany({
      where: {
        projectId: null,
        status: { not: 'done' },
      },
      orderBy: { order: 'asc' },
    });
    return res.json(todos);
  }

  if (tag) {
    const all = await prisma.todo.findMany({ orderBy: { order: 'asc' } });
    const filtered = all.filter((t: Todo) => {
      const tags = t.tags as string[];
      return tags.includes(String(tag));
    });
    return res.json(filtered);
  }

  if (repeatTemplates === 'true') {
    const all = await prisma.todo.findMany({ orderBy: { order: 'asc' } });
    const filtered = all.filter((t: Todo) => t.repeatRule !== null);
    return res.json(filtered);
  }

  const todos = await prisma.todo.findMany({ orderBy: { order: 'asc' } });
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { title, description, instructions, priority, estimatedMinutes, tags, projectId, parentId, dueDate, scheduledDate, repeatRule, order, isGoal } = req.body;

  // If parentId is set, inherit projectId from parent
  let finalProjectId = projectId;
  if (parentId && !projectId) {
    const parent = await prisma.todo.findUnique({ where: { id: parentId } });
    if (parent) {
      finalProjectId = parent.projectId;
    }
  }

  // Compute next order if not explicitly provided
  let finalOrder = order;
  if (finalOrder === undefined || finalOrder === null) {
    const maxOrder = await prisma.todo.aggregate({
      _max: { order: true },
    });
    finalOrder = (maxOrder._max.order ?? 0) + 1;
  }

  const todo = await prisma.todo.create({
    data: {
      title,
      description: description ?? '',
      instructions: instructions ?? '',
      status: 'pending',
      priority: priority ?? 'medium',
      estimatedMinutes: estimatedMinutes ?? 60,
      tags: tags ?? [],
      projectId: finalProjectId ?? null,
      parentId: parentId ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      repeatRule: repeatRule ?? null,
      order: finalOrder ?? 0,
      isGoal: isGoal === true,
    },
  });

  if (isGoal === true) {
    const existing = await prisma.roadmap.findUnique({ where: { goalTodoId: todo.id } });
    if (!existing) {
      await prisma.roadmap.create({
        data: { goalTodoId: todo.id, phases: [] },
      });
    }
  }

  res.status(201).json(todo);
});

router.get('/today', async (_req, res) => {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todos = await prisma.todo.findMany({
    where: {
      scheduledDate: { gte: today, lt: tomorrow },
    },
    orderBy: { order: 'asc' },
  });
  res.json(todos);
});

router.get('/unscheduled', async (_req, res) => {
  const todos = await prisma.todo.findMany({
    where: {
      scheduledDate: null,
      status: { not: 'done' },
    },
    orderBy: { order: 'asc' },
  });
  res.json(todos);
});

router.get('/overdue', async (_req, res) => {
  const today = startOfDay(new Date());
  const todos = await prisma.todo.findMany({
    where: {
      status: { not: 'done' },
      dueDate: { lt: today },
    },
    orderBy: { order: 'asc' },
  });
  res.json(todos);
});

router.get('/unassigned', async (_req, res) => {
  const todos = await prisma.todo.findMany({
    where: {
      projectId: null,
      status: { not: 'done' },
    },
    orderBy: { order: 'asc' },
  });
  res.json(todos);
});

router.get('/repeat-templates', async (_req, res) => {
  const all = await prisma.todo.findMany({ orderBy: { order: 'asc' } });
  const filtered = all.filter((t) => t.repeatRule !== null);
  res.json(filtered);
});

router.get('/:id', async (req, res) => {
  const todo = await prisma.todo.findUnique({ where: { id: req.params.id } });
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

router.get('/:id/spawned', async (req, res) => {
  const relations = await prisma.todoRelation.findMany({
    where: { fromTodoId: req.params.id, type: 'source_from' },
  });
  const todos = [];
  for (const rel of relations) {
    const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
    if (todo) todos.push(todo);
  }
  res.json(todos);
});

router.get('/:id/instances', async (req, res) => {
  const relations = await prisma.todoRelation.findMany({
    where: { fromTodoId: req.params.id, type: 'assign_from' },
  });
  const todos = [];
  for (const rel of relations) {
    const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
    if (todo) todos.push(todo);
  }
  res.json(todos);
});

router.get('/:id/template', async (req, res) => {
  const relation = await prisma.todoRelation.findFirst({
    where: { toTodoId: req.params.id, type: 'assign_from' },
  });
  if (!relation) return res.json(null);
  const todo = await prisma.todo.findUnique({ where: { id: relation.fromTodoId } });
  res.json(todo);
});

router.patch('/:id', async (req, res) => {
  const { isGoal, ...data } = req.body;
  const updateData: Prisma.TodoUpdateInput = { ...data };
  if (isGoal !== undefined) updateData.isGoal = isGoal;

  const todo = await prisma.todo.update({
    where: { id: req.params.id },
    data: updateData,
  });

  if (isGoal === true) {
    const existing = await prisma.roadmap.findUnique({ where: { goalTodoId: req.params.id } });
    if (!existing) {
      await prisma.roadmap.create({
        data: { goalTodoId: req.params.id, phases: [] },
      });
    }
  } else if (isGoal === false) {
    await prisma.roadmap.deleteMany({ where: { goalTodoId: req.params.id } });
  }

  res.json(todo);
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const data: Prisma.TodoUpdateInput = { status };
  if (status === 'in_progress') {
    data.startedAt = new Date();
  } else if (status === 'pending') {
    data.startedAt = null;
  } else if (status === 'done') {
    data.completedAt = new Date();
  }
  const todo = await prisma.todo.update({
    where: { id: req.params.id },
    data,
  });
  res.json(todo);
});

router.patch('/:id/schedule', async (req, res) => {
  const { scheduledDate } = req.body;
  const todo = await prisma.todo.update({
    where: { id: req.params.id },
    data: { scheduledDate: scheduledDate ? new Date(scheduledDate) : null },
  });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // Delete assigned instances first
  const assignedRelations = await prisma.todoRelation.findMany({
    where: { fromTodoId: id, type: 'assign_from' },
  });
  for (const rel of assignedRelations) {
    await prisma.todo.delete({ where: { id: rel.toTodoId } }).catch(() => {});
  }

  // Delete the todo (cascade handles children, relations, logs)
  await prisma.todo.delete({ where: { id } }).catch(() => {});
  res.status(204).send();
});

router.post('/sync-repeats', async (req, res) => {
  const { startDate, endDate } = req.body;
  const templates = await prisma.todo.findMany({
    where: { repeatRule: { not: Prisma.JsonNull } },
  });

  let createdCount = 0;
  const start = startOfDay(new Date(startDate));
  const rangeEnd = startOfDay(new Date(endDate));

  for (const template of templates) {
    if (!template.repeatRule) continue;

    const rule = template.repeatRule as { type: string; weekDays?: number[]; interval?: number; endDate?: string };
    const ruleEnd = rule.endDate ? startOfDay(new Date(rule.endDate)) : undefined;

    const targetDates: Date[] = [];
    const current = new Date(start);

    while (current <= rangeEnd) {
      let shouldInclude = false;

      if (rule.type === 'daily') {
        shouldInclude = true;
      } else if (rule.type === 'weekly' && rule.weekDays) {
        shouldInclude = rule.weekDays.includes(current.getDay());
      } else if (rule.type === 'every_n_days' && rule.interval) {
        const anchor = startOfDay(new Date(template.createdAt));
        const daysSinceAnchor = Math.floor(
          (current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)
        );
        shouldInclude = daysSinceAnchor >= 0 && daysSinceAnchor % rule.interval === 0;
      }

      if (shouldInclude) {
        if (!ruleEnd || current <= ruleEnd) {
          targetDates.push(new Date(current));
        }
      }

      current.setDate(current.getDate() + 1);
    }

    const existingInstances = await prisma.todoRelation.findMany({
      where: { fromTodoId: template.id, type: 'assign_from' },
    });
    const instanceTodos = [];
    for (const rel of existingInstances) {
      const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
      if (todo) instanceTodos.push(todo);
    }

    for (const date of targetDates) {
      const hasInstance = instanceTodos.some((inst) => {
        if (!inst.scheduledDate) return false;
        return isSameDay(new Date(inst.scheduledDate), date);
      });

      if (!hasInstance) {
        const instance = await prisma.todo.create({
          data: {
            title: template.title,
            description: template.description,
            priority: template.priority,
            estimatedMinutes: template.estimatedMinutes,
            tags: template.tags as string[],
            projectId: template.projectId,
            scheduledDate: date,
            status: 'pending',
            order: 0,
          },
        });
        await prisma.todoRelation.create({
          data: {
            fromTodoId: template.id,
            toTodoId: instance.id,
            type: 'assign_from',
          },
        });
        createdCount++;
      }
    }
  }

  res.json({ createdCount });
});

router.patch('/:id/reorder', async (req, res) => {
  const { order } = req.body;
  const todo = await prisma.todo.update({
    where: { id: req.params.id },
    data: { order: order ?? 0 },
  });
  res.json(todo);
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body as { orderedIds: string[] };
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.todo.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  res.json({ updated: true });
});

router.patch('/:id/repeat-rule', async (req, res) => {
  const { rule } = req.body;
  const template = await prisma.todo.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: 'Todo not found' });

  await prisma.todo.update({
    where: { id: req.params.id },
    data: { repeatRule: rule ?? null },
  });

  if (!rule) return res.json({ updated: true });

  const existingInstances = await prisma.todoRelation.findMany({
    where: { fromTodoId: req.params.id, type: 'assign_from' },
  });
  const instanceTodos = [];
  for (const rel of existingInstances) {
    const todo = await prisma.todo.findUnique({ where: { id: rel.toTodoId } });
    if (todo) instanceTodos.push(todo);
  }

  const typedRule = rule as { type: string; weekDays?: number[]; interval?: number; endDate?: string };
  const ruleEnd = typedRule.endDate ? startOfDay(new Date(typedRule.endDate)) : undefined;

  for (const instance of instanceTodos) {
    if (!instance.scheduledDate) continue;

    const date = startOfDay(new Date(instance.scheduledDate));
    let matches = false;

    if (typedRule.type === 'daily') {
      matches = true;
    } else if (typedRule.type === 'weekly' && typedRule.weekDays) {
      matches = typedRule.weekDays.includes(date.getDay());
    } else if (typedRule.type === 'every_n_days' && typedRule.interval) {
      const anchor = startOfDay(new Date(template.createdAt));
      const daysSinceAnchor = Math.floor(
        (date.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24)
      );
      matches = daysSinceAnchor >= 0 && daysSinceAnchor % typedRule.interval === 0;
    }

    if (ruleEnd && date > ruleEnd) {
      matches = false;
    }

    if (!matches) {
      await prisma.todoRelation.deleteMany({
        where: { OR: [{ fromTodoId: instance.id }, { toTodoId: instance.id }] },
      });
      await prisma.todoLog.deleteMany({ where: { todoId: instance.id } });
      await prisma.todo.delete({ where: { id: instance.id } }).catch(() => {});
    }
  }

  res.json({ updated: true });
});

export default router;
