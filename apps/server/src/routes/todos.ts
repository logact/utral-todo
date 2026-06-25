import { Router } from 'express';
import { eq, ne, and, or, lt, gte, isNotNull, isNull, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
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
  const { parentId, root, nodeType, date, tag, unscheduled, overdue, unassigned, repeatTemplates } = req.query;

  if (nodeType) {
    const todos = await db.select().from(schema.todo)
      .where(eq(schema.todo.nodeType, String(nodeType)))
      .orderBy(schema.todo.order);
    return res.json(todos);
  }

  if (parentId) {
    const todos = await db.select().from(schema.todo)
      .where(eq(schema.todo.parentId, String(parentId)))
      .orderBy(schema.todo.order);
    return res.json(todos);
  }

  if (root === 'true') {
    const todos = await db.select().from(schema.todo)
      .where(isNull(schema.todo.parentId))
      .orderBy(schema.todo.order);
    return res.json(todos);
  }

  if (date) {
    const d = new Date(String(date));
    const start = startOfDay(d);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [realTodos, virtualTodos] = await Promise.all([
      db.select().from(schema.todo)
        .where(and(gte(schema.todo.scheduledDate, start), lt(schema.todo.scheduledDate, end)))
        .orderBy(schema.todo.order),
      getVirtualTodosForDate(d),
    ]);
    return res.json([...realTodos, ...virtualTodos]);
  }

  if (unscheduled === 'true') {
    const todos = await db.select().from(schema.todo)
      .where(and(isNull(schema.todo.scheduledDate), ne(schema.todo.status, 'done')))
      .orderBy(schema.todo.order);
    return res.json(todos);
  }

  if (overdue === 'true') {
    const today = startOfDay(new Date());
    const todos = await db.select().from(schema.todo)
      .where(and(ne(schema.todo.status, 'done'), lt(schema.todo.dueDate, today)))
      .orderBy(schema.todo.order);
    return res.json(todos);
  }

  if (unassigned === 'true') {
    const todos = await db.select().from(schema.todo)
      .where(and(isNull(schema.todo.parentId), ne(schema.todo.status, 'done')))
      .orderBy(schema.todo.order);
    return res.json(todos);
  }

  if (tag) {
    const all = await db.select().from(schema.todo).orderBy(schema.todo.order);
    const filtered = all.filter((t) => {
      const tags = t.tags as string[];
      return tags?.includes(String(tag));
    });
    return res.json(filtered);
  }

  if (repeatTemplates === 'true') {
    const all = await db.select().from(schema.todo).orderBy(schema.todo.order);
    const filtered = all.filter((t) => t.repeatRule !== null);
    return res.json(filtered);
  }

  const todos = await db.select().from(schema.todo).orderBy(schema.todo.order);
  res.json(todos);
});

router.post('/', async (req, res) => {
  const {
    title, description, nodeType, pattern, priority, estimatedMinutes, tags,
    parentId, dueDate, scheduledDate, scheduledEndDate,
    repeatRule, order,
    motivation, successCriteria, targetDate, goalStatus,
  } = req.body;

  validateNodeType(req.body);

  const resolvedNodeType = nodeType || 'task';

  // Validate goal parent must be a goal
  if (parentId) {
    const parentRows = await db.select().from(schema.todo).where(eq(schema.todo.id, parentId)).limit(1);
    const parent = parentRows[0];
    if (parent && resolvedNodeType === 'goal' && parent.nodeType !== 'goal') {
      return res.status(400).json({ error: 'Goal parent must be a goal' });
    }
  }

  // Compute next order if not explicitly provided
  let finalOrder = order;
  if (finalOrder === undefined || finalOrder === null) {
    const maxResult = await db.select({ max: sql<number>`max(${schema.todo.order})` }).from(schema.todo);
    finalOrder = (maxResult[0]?.max ?? 0) + 1;
  }

  const isTaskNode = resolvedNodeType === 'task';
  const isGoalNode = resolvedNodeType === 'goal';

  const todoData = {
    title,
    nodeType: resolvedNodeType,
    pattern: isTaskNode ? (pattern || 'task') : null,
    description: description ?? '',
    status: isTaskNode ? (req.body.status || 'pending') : null,
    priority: isTaskNode ? (priority ?? 'medium') : null,
    estimatedMinutes: isTaskNode ? (estimatedMinutes ?? 60) : null,
    tags: tags ?? [],
    parentId: parentId ?? null,
    dueDate: dueDate ? new Date(dueDate) : null,
    scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : null,
    repeatRule: repeatRule ?? null,
    order: finalOrder ?? 0,
    motivation: isGoalNode ? motivation : null,
    successCriteria: isGoalNode ? successCriteria : null,
    targetDate: targetDate ? new Date(targetDate) : null,
    goalStatus: isGoalNode ? (goalStatus || 'active') : null,
  };

  const todo = (await db.insert(schema.todo).values(todoData as any).returning())[0];

  await logChange(req, 'todo', 'create', todo.id, todo);
  res.status(201).json(todo);
});

router.get('/today', async (_req, res) => {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todos = await db.select().from(schema.todo)
    .where(and(gte(schema.todo.scheduledDate, today), lt(schema.todo.scheduledDate, tomorrow)))
    .orderBy(schema.todo.order);
  res.json(todos);
});

router.get('/unscheduled', async (_req, res) => {
  const todos = await db.select().from(schema.todo)
    .where(and(isNull(schema.todo.scheduledDate), ne(schema.todo.status, 'done')))
    .orderBy(schema.todo.order);
  res.json(todos);
});

router.get('/overdue', async (_req, res) => {
  const today = startOfDay(new Date());
  const todos = await db.select().from(schema.todo)
    .where(and(ne(schema.todo.status, 'done'), lt(schema.todo.dueDate, today)))
    .orderBy(schema.todo.order);
  res.json(todos);
});

router.get('/unassigned', async (_req, res) => {
  const todos = await db.select().from(schema.todo)
    .where(and(isNull(schema.todo.parentId), ne(schema.todo.status, 'done')))
    .orderBy(schema.todo.order);
  res.json(todos);
});

router.get('/repeat-templates', async (_req, res) => {
  const all = await db.select().from(schema.todo).orderBy(schema.todo.order);
  const filtered = all.filter((t) => t.repeatRule !== null);
  res.json(filtered);
});

router.get('/:id', async (req, res) => {
  const rows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.params.id)).limit(1);
  const todo = rows[0];
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

router.get('/:id/spawned', async (req, res) => {
  const relations = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, req.params.id), eq(schema.todoRelation.type, 'source_from')));
  const todos = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1);
    if (todoRows[0]) todos.push(todoRows[0]);
  }
  res.json(todos);
});

router.get('/:id/instances', async (req, res) => {
  const relations = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, req.params.id), eq(schema.todoRelation.type, 'assign_from')));
  const todos = [];
  for (const rel of relations) {
    const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1);
    if (todoRows[0]) todos.push(todoRows[0]);
  }
  res.json(todos);
});

router.get('/:id/template', async (req, res) => {
  const relationRows = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.toTodoId, req.params.id), eq(schema.todoRelation.type, 'assign_from')))
    .limit(1);
  const relation = relationRows[0];
  if (!relation) return res.json(null);
  const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, relation.fromTodoId)).limit(1);
  res.json(todoRows[0] ?? null);
});

router.patch('/:id', async (req, res) => {
  const { nodeType, pattern, scheduledEndDate, targetDate, motivation, successCriteria, goalStatus, ...data } = req.body;

  validateNodeType(req.body);

  const existingRows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.params.id)).limit(1);
  const existingTodo = existingRows[0];
  if (!existingTodo) return res.status(404).json({ error: 'Todo not found' });
  if (existingTodo.isSystemTask) return res.status(403).json({ error: 'Cannot modify system tasks' });

  // Validate that a goal's parent must be a goal
  if (req.body.parentId) {
    const isGoal = req.body.nodeType === 'goal' || (!req.body.nodeType && existingTodo?.nodeType === 'goal');
    if (isGoal) {
      const parentRows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.body.parentId)).limit(1);
      const parent = parentRows[0];
      if (parent && parent.nodeType !== 'goal') {
        return res.status(400).json({ error: 'Goal parent must be a goal' });
      }
    }
  }

  const updateData: Record<string, unknown> = { ...data };
  if (scheduledEndDate !== undefined) updateData.scheduledEndDate = scheduledEndDate ? new Date(scheduledEndDate) : null;
  if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null;
  if (motivation !== undefined) updateData.motivation = motivation;
  if (successCriteria !== undefined) updateData.successCriteria = successCriteria;
  if (goalStatus !== undefined) updateData.goalStatus = goalStatus;
  if (pattern !== undefined) updateData.pattern = pattern;

  if (nodeType !== undefined) {
    updateData.nodeType = nodeType;
  }

  const todo = (await db.update(schema.todo).set(updateData as any).where(eq(schema.todo.id, req.params.id)).returning())[0];

  await logChange(req, 'todo', 'update', todo.id, todo);
  res.json(todo);
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const existingRows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.params.id)).limit(1);
  const existingTodo = existingRows[0];
  if (!existingTodo) return res.status(404).json({ error: 'Todo not found' });
  if (existingTodo.isSystemTask) return res.status(403).json({ error: 'Cannot modify system tasks' });

  const data: Record<string, unknown> = { status };
  if (status === 'in_progress') {
    data.startedAt = new Date();
  } else if (status === 'pending') {
    data.startedAt = null;
  } else if (status === 'done') {
    data.completedAt = new Date();
  }
  const todo = (await db.update(schema.todo).set(data).where(eq(schema.todo.id, req.params.id)).returning())[0];
  await logChange(req, 'todo', 'update', todo.id, todo);
  res.json(todo);
});

router.patch('/:id/schedule', async (req, res) => {
  const { scheduledDate } = req.body;
  const existingRows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.params.id)).limit(1);
  const existingTodo = existingRows[0];
  if (!existingTodo) return res.status(404).json({ error: 'Todo not found' });
  if (existingTodo.isSystemTask) return res.status(403).json({ error: 'Cannot modify system tasks' });

  const todo = (await db.update(schema.todo)
    .set({ scheduledDate: scheduledDate ? new Date(scheduledDate) : null })
    .where(eq(schema.todo.id, req.params.id))
    .returning())[0];
  await logChange(req, 'todo', 'update', todo.id, todo);
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const existingRows = await db.select().from(schema.todo).where(eq(schema.todo.id, id)).limit(1);
  const existingTodo = existingRows[0];
  if (!existingTodo) return res.status(404).json({ error: 'Todo not found' });
  if (existingTodo.isSystemTask) return res.status(403).json({ error: 'Cannot delete system tasks' });

  // Delete assigned instances first
  const assignedRelations = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, id), eq(schema.todoRelation.type, 'assign_from')));
  for (const rel of assignedRelations) {
    await db.delete(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).catch(() => {});
    await logChange(req, 'todo', 'delete', rel.toTodoId);
  }

  // Delete the todo (cascade handles children, relations, logs)
  await db.delete(schema.todo).where(eq(schema.todo.id, id)).catch(() => {});
  await logChange(req, 'todo', 'delete', id);
  res.status(204).send();
});

router.post('/sync-repeats', async (req, res) => {
  const { startDate, endDate } = req.body;
  const templates = await db.select().from(schema.todo).where(isNotNull(schema.todo.repeatRule));

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

    const existingInstances = await db.select().from(schema.todoRelation)
      .where(and(eq(schema.todoRelation.fromTodoId, template.id), eq(schema.todoRelation.type, 'assign_from')));
    const instanceTodos = [];
    for (const rel of existingInstances) {
      const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1);
      if (todoRows[0]) instanceTodos.push(todoRows[0]);
    }

    for (const date of targetDates) {
      const hasInstance = instanceTodos.some((inst) => {
        if (!inst.scheduledDate) return false;
        return isSameDay(new Date(inst.scheduledDate), date);
      });

      if (!hasInstance) {
        const instance = (await db.insert(schema.todo).values({
          nodeType: 'task',
          pattern: template.pattern ?? 'task',
          title: template.title,
          description: template.description,
          priority: template.priority,
          estimatedMinutes: template.estimatedMinutes,
          tags: template.tags as string[],
          scheduledDate: date,
          status: 'pending',
          order: 0,
        }).returning())[0];
        await logChange(req, 'todo', 'create', instance.id, instance);
        const relation = (await db.insert(schema.todoRelation).values({
          fromTodoId: template.id,
          toTodoId: instance.id,
          type: 'assign_from',
        }).returning())[0];
        await logChange(req, 'todoRelation', 'create', relation.id, relation);
        createdCount++;
      }
    }
  }

  res.json({ createdCount });
});

router.patch('/:id/reorder', async (req, res) => {
  const { order } = req.body;
  const existingRows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.params.id)).limit(1);
  const existingTodo = existingRows[0];
  if (!existingTodo) return res.status(404).json({ error: 'Todo not found' });
  if (existingTodo.isSystemTask) return res.status(403).json({ error: 'Cannot modify system tasks' });

  const todo = (await db.update(schema.todo)
    .set({ order: order ?? 0 })
    .where(eq(schema.todo.id, req.params.id))
    .returning())[0];
  await logChange(req, 'todo', 'update', todo.id, todo);
  res.json(todo);
});

router.post('/reorder', async (req, res) => {
  const { orderedIds } = req.body as { orderedIds: string[] };
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index++) {
      await tx.update(schema.todo).set({ order: index }).where(eq(schema.todo.id, orderedIds[index]));
    }
  });

  for (const id of orderedIds) {
    await logChange(req, 'todo', 'update', id);
  }

  res.json({ updated: true });
});

router.patch('/:id/repeat-rule', async (req, res) => {
  const { rule } = req.body;
  const templateRows = await db.select().from(schema.todo).where(eq(schema.todo.id, req.params.id)).limit(1);
  const template = templateRows[0];
  if (!template) return res.status(404).json({ error: 'Todo not found' });
  if (template.isSystemTask) return res.status(403).json({ error: 'Cannot modify system tasks' });

  const updatedTodo = (await db.update(schema.todo)
    .set({ repeatRule: rule ?? null })
    .where(eq(schema.todo.id, req.params.id))
    .returning())[0];
  await logChange(req, 'todo', 'update', updatedTodo.id, updatedTodo);

  if (!rule) return res.json({ updated: true });

  const existingInstances = await db.select().from(schema.todoRelation)
    .where(and(eq(schema.todoRelation.fromTodoId, req.params.id), eq(schema.todoRelation.type, 'assign_from')));
  const instanceTodos = [];
  for (const rel of existingInstances) {
    const todoRows = await db.select().from(schema.todo).where(eq(schema.todo.id, rel.toTodoId)).limit(1);
    if (todoRows[0]) instanceTodos.push(todoRows[0]);
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
      await db.delete(schema.todoRelation).where(
        or(eq(schema.todoRelation.fromTodoId, instance.id), eq(schema.todoRelation.toTodoId, instance.id))
      );
      await db.delete(schema.todoLog).where(eq(schema.todoLog.todoId, instance.id));
      await db.delete(schema.todo).where(eq(schema.todo.id, instance.id)).catch(() => {});
      await logChange(req, 'todo', 'delete', instance.id);
    }
  }

  res.json({ updated: true });
});

export default router;
