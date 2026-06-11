import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index.js';
import type { Todo } from '@prisma/client';
import { logChange } from '../sync/log.js';
import { getVirtualTodosForDate } from '../lib/virtualTodos.js';

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

function validateNodeType(body: Record<string, unknown>): void {
  const nodeType = body.nodeType as string | undefined;
  if (!nodeType) return;

  if (nodeType === 'goal') {
    if (body.status) throw new Error('Goal cannot have task status');
    if (body.scheduledDate) throw new Error('Goal cannot be scheduled');
    if (body.priority) throw new Error('Goal cannot have priority');
    if (body.estimatedMinutes) throw new Error('Goal cannot have estimatedMinutes');
  }
}

const router = Router();

router.get('/', async (req, res) => {
  const { projectId, parentId, root, nodeType, date, tag, unscheduled, overdue, unassigned, repeatTemplates } = req.query;

  if (nodeType) {
    const todos = await prisma.todo.findMany({
      where: { nodeType: String(nodeType) },
      orderBy: { order: 'asc' },
    });
    return res.json(todos);
  }

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
    const [realTodos, virtualTodos] = await Promise.all([
      prisma.todo.findMany({
        where: {
          scheduledDate: { gte: start, lt: end },
        },
        orderBy: { order: 'asc' },
      }),
      getVirtualTodosForDate(d),
    ]);
    return res.json([...realTodos, ...virtualTodos]);
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
  const {
    title, description, nodeType, pattern, priority, estimatedMinutes, tags,
    projectId, parentId, dueDate, scheduledDate, scheduledEndDate,
    repeatRule, order,
    motivation, successCriteria, targetDate, goalStatus,
  } = req.body;

  validateNodeType(req.body);

  const resolvedNodeType = nodeType || 'task';

  // If parentId is set, inherit projectId from parent and validate goal parent
  let finalProjectId = projectId;
  if (parentId) {
    const parent = await prisma.todo.findUnique({ where: { id: parentId } });
    if (parent) {
      if (!projectId) finalProjectId = parent.projectId;
      if (resolvedNodeType === 'goal' && parent.nodeType !== 'goal') {
        return res.status(400).json({ error: 'Goal parent must be a goal' });
      }
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

  const isTaskNode = resolvedNodeType === 'task';
  const todo = await prisma.todo.create({
    data: {
      title,
      nodeType: resolvedNodeType,
      pattern: isTaskNode ? (pattern || 'task') : null,
      description: description ?? '',
      status: isTaskNode ? (req.body.status || 'pending') : null,
      priority: isTaskNode ? (priority ?? 'medium') : null,
      estimatedMinutes: isTaskNode ? (estimatedMinutes ?? 60) : null,
      tags: tags ?? [],
      projectId: finalProjectId ?? null,
      parentId: parentId ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : null,
      repeatRule: repeatRule ?? null,
      order: finalOrder ?? 0,
      motivation: resolvedNodeType === 'goal' ? motivation : null,
      successCriteria: resolvedNodeType === 'goal' ? successCriteria : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      goalStatus: resolvedNodeType === 'goal' ? (goalStatus || 'active') : null,
    },
  });

  await logChange(req, 'todo', 'create', todo.id, todo);
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
  const { nodeType, pattern, scheduledEndDate, targetDate, motivation, successCriteria, goalStatus, ...data } = req.body;

  validateNodeType(req.body);

  // Validate that a goal's parent must be a goal
  if (req.body.parentId) {
    const existingTodo = await prisma.todo.findUnique({ where: { id: req.params.id } });
    const isGoal = req.body.nodeType === 'goal' || (!req.body.nodeType && existingTodo?.nodeType === 'goal');
    if (isGoal) {
      const parent = await prisma.todo.findUnique({ where: { id: req.body.parentId } });
      if (parent && parent.nodeType !== 'goal') {
        return res.status(400).json({ error: 'Goal parent must be a goal' });
      }
    }
  }

  const updateData: Prisma.TodoUpdateInput = { ...data };
  if (scheduledEndDate !== undefined) updateData.scheduledEndDate = scheduledEndDate ? new Date(scheduledEndDate) : null;
  if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null;
  if (motivation !== undefined) updateData.motivation = motivation;
  if (successCriteria !== undefined) updateData.successCriteria = successCriteria;
  if (goalStatus !== undefined) updateData.goalStatus = goalStatus;
  if (pattern !== undefined) updateData.pattern = pattern;

  if (nodeType !== undefined) {
    updateData.nodeType = nodeType;
  }

  const todo = await prisma.todo.update({
    where: { id: req.params.id },
    data: updateData,
  });

  await logChange(req, 'todo', 'update', todo.id, todo);
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
  await logChange(req, 'todo', 'update', todo.id, todo);
  res.json(todo);
});

router.patch('/:id/schedule', async (req, res) => {
  const { scheduledDate } = req.body;
  const todo = await prisma.todo.update({
    where: { id: req.params.id },
    data: { scheduledDate: scheduledDate ? new Date(scheduledDate) : null },
  });
  await logChange(req, 'todo', 'update', todo.id, todo);
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
    await logChange(req, 'todo', 'delete', rel.toTodoId);
  }

  // Delete the todo (cascade handles children, relations, logs)
  await prisma.todo.delete({ where: { id } }).catch(() => {});
  await logChange(req, 'todo', 'delete', id);
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
            nodeType: 'task',
            pattern: template.pattern ?? 'task',
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
        await logChange(req, 'todo', 'create', instance.id, instance);
        const relation = await prisma.todoRelation.create({
          data: {
            fromTodoId: template.id,
            toTodoId: instance.id,
            type: 'assign_from',
          },
        });
        await logChange(req, 'todoRelation', 'create', relation.id, relation);
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
  await logChange(req, 'todo', 'update', todo.id, todo);
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

  for (const id of orderedIds) {
    await logChange(req, 'todo', 'update', id);
  }

  res.json({ updated: true });
});

router.patch('/:id/repeat-rule', async (req, res) => {
  const { rule } = req.body;
  const template = await prisma.todo.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: 'Todo not found' });

  const updatedTodo = await prisma.todo.update({
    where: { id: req.params.id },
    data: { repeatRule: rule ?? null },
  });
  await logChange(req, 'todo', 'update', updatedTodo.id, updatedTodo);

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
      await logChange(req, 'todo', 'delete', instance.id);
    }
  }

  res.json({ updated: true });
});

export default router;
