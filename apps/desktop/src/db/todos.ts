import { db } from './drizzle-adapter';
import { todos, todoRelations, plans as plansTable } from './schema';
import { eq, and, lt, gte, isNotNull, isNull } from 'drizzle-orm';
import { syncLocalChange, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { createPlan } from './plans';
import { dateMatchesRule, computeVirtualTodo } from '../types';
import { newHLC, mergeHLC } from '../types';
import type { Todo, TodoStatus, Priority, RepeatRule, NodeType, GoalStatus, TaskPattern, Plan } from '../types';
import {
  todoToRow,
  rowToTodo,
  planToRow,
  rowToPlan,
  rowToRelation,
} from './schema';

export const ROOT_GOAL_ID = 'system:root-goal';

export async function createTodo(
  title: string,
  options?: {
    nodeType?: NodeType;
    pattern?: TaskPattern;
    parentId?: string;
    description?: string;
    priority?: Priority;
    estimatedMinutes?: number;
    dueDate?: Date;
    scheduledDate?: Date;
    scheduledEndDate?: Date;
    tags?: string[];
    repeatRule?: RepeatRule;
    order?: number;
    status?: TodoStatus;
    motivation?: string;
    successCriteria?: string;
    targetDate?: Date;
    goalStatus?: GoalStatus;
  }
): Promise<Todo> {
  const nodeId = await getOrCreateDeviceId();
  const hlc = newHLC(nodeId);
  const nodeType = options?.nodeType || 'task';
  const isTaskNode = nodeType === 'task';


  const todo: Todo = {
    id: crypto.randomUUID(),
    nodeType,
    pattern: isTaskNode ? (options?.pattern ?? 'task') : undefined,
    title,
    description: options?.description ?? '',
    status: isTaskNode ? (options?.status ?? 'pending') : undefined,
    priority: isTaskNode ? (options?.priority ?? 'medium') : undefined,
    estimatedMinutes: isTaskNode ? (options?.estimatedMinutes ?? 60) : undefined,
    tags: options?.tags ?? [],
    createdAt: hlc,
    updatedAt: hlc,
    parentId: options?.parentId,
    dueDate: options?.dueDate,
    scheduledDate: options?.scheduledDate,
    scheduledEndDate: options?.scheduledEndDate,
    repeatRule: options?.repeatRule,
    order: options?.order ?? 0,
    motivation: nodeType === 'goal' ? options?.motivation : undefined,
    successCriteria: nodeType === 'goal' ? options?.successCriteria : undefined,
    targetDate: options?.targetDate,
    goalStatus: nodeType === 'goal' ? (options?.goalStatus ?? 'active') : undefined,
    isDeleted: false,
  };
  const newRow = todoToRow(todo);
  await db.insert(todos).values(newRow);
  syncLocalChange('todos', 'create', todo.id).catch(() => {});

  return todo;
}

export async function createGoal(
  title: string,
  options?: {
    parentId?: string;
    description?: string;
    tags?: string[];
    order?: number;
    motivation?: string;
    successCriteria?: string;
    targetDate?: Date;
    goalStatus?: GoalStatus;
  }
): Promise<Todo> {
  const goal = await createTodo(title, {
    nodeType: 'goal',
    ...options,
  });

  const plan = await createPlan(goal.id, 'Default Plan');
  await updateTodo(goal.id, { activePlanId: plan.id });

  return { ...goal, activePlanId: plan.id };
}

export async function createTask(
  title: string,
  options?: {
    parentId?: string;
    description?: string;
    priority?: Priority;
    estimatedMinutes?: number;
    dueDate?: Date;
    scheduledDate?: Date;
    scheduledEndDate?: Date;
    tags?: string[];
    repeatRule?: RepeatRule;
    order?: number;
    status?: TodoStatus;
  }
): Promise<Todo> {
  return createTodo(title, {
    nodeType: 'task',
    ...options,
  });
}

export async function getAllTodos(): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(eq(todos.isDeleted, false)) as any[];
  return rows.map(rowToTodo);
}

export async function getRootTodos(): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(eq(todos.isDeleted, false), isNull(todos.parentId))
  ) as any[];
  return rows.map(rowToTodo);
}

export async function getRootGoal(): Promise<Todo | undefined> {
  const rows = await db.select().from(todos).where(eq(todos.isRootGoal, true)) as any[];
  const row = rows[0];
  return row ? rowToTodo(row) : undefined;
}

export async function ensureRootGoal(): Promise<Todo> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(todos).where(eq(todos.id, ROOT_GOAL_ID)) as any[];
    const existing = rows[0];
    if (existing) return rowToTodo(existing);

    const nodeId = await getOrCreateDeviceId();
    const hlc = newHLC(nodeId);
    const rootGoal: Todo = {
      id: ROOT_GOAL_ID,
      nodeType: 'goal',
      title: 'Root Goal',
      description: '',
      isRootGoal: true,
      goalStatus: 'active',
      tags: [],
      order: 0,
      createdAt: hlc,
      updatedAt: hlc,
      isDeleted: false,
    };
    await tx.insert(todos).values(todoToRow(rootGoal));
    syncLocalChange('todos', 'create', rootGoal.id).catch(() => {});

    const plan: Plan = {
      id: crypto.randomUUID(),
      goalTodoId: rootGoal.id,
      title: 'Root Road',
      nodeIds: [],
      edgeIds: [],
      isSystemPlan: true,
      createdAt: hlc,
      updatedAt: hlc,
      isDeleted: false,
    };
    await tx.insert(plansTable).values(planToRow(plan));
    syncLocalChange('plans', 'create', plan.id).catch(() => {});

    await tx.update(todos).set({
      activePlanId: plan.id,
      updatedAtWall: hlc.wall,
      updatedAtCounter: hlc.counter,
      updatedAtNode: hlc.node,
    }).where(eq(todos.id, rootGoal.id));
    syncLocalChange('todos', 'update', rootGoal.id).catch(() => {});

    return { ...rootGoal, activePlanId: plan.id };
  });
}

export async function getSubTodos(parentId: string): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(eq(todos.parentId, parentId), eq(todos.isDeleted, false))
  ) as any[];
  const items = rows.map(rowToTodo);
  return items.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (b.createdAt?.wall ?? 0) - (a.createdAt?.wall ?? 0);
  });
}

export async function getSubGoals(parentId: string): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(
      eq(todos.parentId, parentId),
      eq(todos.nodeType, 'goal'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  const items = rows.map(rowToTodo);
  return items.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (b.createdAt?.wall ?? 0) - (a.createdAt?.wall ?? 0);
  });
}

export async function traceParentChain(todoId: string): Promise<Todo[]> {
  const chain: Todo[] = [];
  const visited = new Set<string>();
  let currentId = todoId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const todo = await getTodo(currentId);
    if (!todo) break;
    chain.unshift(todo);

    if (todo.parentId) {
      currentId = todo.parentId;
      continue;
    }

    const relRows = await db.select().from(todoRelations).where(
      and(
        eq(todoRelations.toTodoId, currentId),
        eq(todoRelations.type, 'source_from'),
        eq(todoRelations.isDeleted, false)
      )
    ) as any[];
    const relations = relRows.map(rowToRelation);
    const sourceRel = relations[0];
    if (sourceRel) {
      currentId = sourceRel.fromTodoId;
      continue;
    }

    break;
  }

  return chain;
}

export async function traceGoalChain(todoId: string): Promise<Todo[]> {
  const chain = await traceParentChain(todoId);
  return chain.filter((t) => t.nodeType === 'goal');
}

export async function getTodoDescendants(todoId: string): Promise<Todo[]> {
  const descendants: Todo[] = [];

  async function collect(parentId: string) {
    const children = await getSubTodos(parentId);
    for (const child of children) {
      descendants.push(child);
      await collect(child.id);
    }
  }

  await collect(todoId);
  return descendants;
}

export async function reorderSubTodos(_parentId: string, orderedIds: string[]): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  for (let i = 0; i < orderedIds.length; i++) {
    const rows = await db.select().from(todos).where(eq(todos.id, orderedIds[i])) as any[];
    const existing = rows[0] ? rowToTodo(rows[0]) : undefined;
    const mergedUpdatedAt = existing?.updatedAt
      ? mergeHLC(existing.updatedAt, newHLC(nodeId))
      : newHLC(nodeId);
    await db.update(todos).set({
      order: i,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    }).where(eq(todos.id, orderedIds[i]));
    syncLocalChange('todos', 'update', orderedIds[i]).catch(() => {});
  }
}

export async function reorderTodos(orderedIds: string[]): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  for (let i = 0; i < orderedIds.length; i++) {
    const rows = await db.select().from(todos).where(eq(todos.id, orderedIds[i])) as any[];
    const existing = rows[0] ? rowToTodo(rows[0]) : undefined;
    const mergedUpdatedAt = existing?.updatedAt
      ? mergeHLC(existing.updatedAt, newHLC(nodeId))
      : newHLC(nodeId);
    await db.update(todos).set({
      order: i,
      updatedAtWall: mergedUpdatedAt.wall,
      updatedAtCounter: mergedUpdatedAt.counter,
      updatedAtNode: mergedUpdatedAt.node,
    }).where(eq(todos.id, orderedIds[i]));
    syncLocalChange('todos', 'update', orderedIds[i]).catch(() => {});
  }
}

export async function getTodo(id: string): Promise<Todo | undefined> {
  const rows = await db.select().from(todos).where(eq(todos.id, id)) as any[];
  const row = rows[0];
  return row ? rowToTodo(row) : undefined;
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<void> {
  const existing = await getTodo(id);
  if (existing?.isRootGoal) {
    throw new Error('Cannot modify the root goal');
  }
  if (existing?.isSystemTask) {
    throw new Error('Cannot modify system tasks');
  }
  const nodeId = await getOrCreateDeviceId();
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(todos).set({
    ...todoToRow({ ...updates, updatedAt: mergedUpdatedAt } as Partial<Todo>),
  }).where(eq(todos.id, id));
  syncLocalChange('todos', 'update', id).catch(() => {});
}

export async function deleteTodo(id: string): Promise<void> {
  const todo = await getTodo(id);
  if (todo?.isRootGoal) {
    throw new Error('Cannot delete the root goal');
  }
  if (todo?.isSystemTask) {
    throw new Error('Cannot delete system tasks');
  }

  const nodeId = await getOrCreateDeviceId();
  const tombstoneHLC = newHLC(nodeId);

  if (todo?.nodeType === 'goal') {
    const planRows = await db.select().from(plansTable).where(
      eq(plansTable.goalTodoId, id)
    ) as any[];
    const goalPlans = planRows.map(rowToPlan);
    for (const plan of goalPlans) {
      const mergedPlanUpdatedAt = plan.updatedAt
        ? mergeHLC(plan.updatedAt, tombstoneHLC)
        : tombstoneHLC;
      await db.update(plansTable).set({
        isDeleted: true,
        updatedAtWall: mergedPlanUpdatedAt.wall,
        updatedAtCounter: mergedPlanUpdatedAt.counter,
        updatedAtNode: mergedPlanUpdatedAt.node,
      }).where(eq(plansTable.id, plan.id));
      syncLocalChange('plans', 'delete', plan.id).catch(() => {});
    }
  } else {
    const allPlanRows = await db.select().from(plansTable) as any[];
    const allPlans = allPlanRows.map(rowToPlan);
    const allEdgeRows = await db.select().from(
      (await import('./schema')).actionEdges
    ) as any[];
    const edges = allEdgeRows.map((await import('./schema')).rowToActionEdge);
    for (const plan of allPlans) {
      if (plan.nodeIds.includes(id)) {
        const newNodeIds = plan.nodeIds.filter((tid) => tid !== id);
        const edgeIdsToRemove = new Set(
          plan.edgeIds.filter((eid) => {
            const edge = edges.find((e) => e.id === eid);
            return edge?.fromTodoId === id || edge?.toTodoId === id;
          })
        );
        const newEdgeIds = plan.edgeIds.filter((eid) => !edgeIdsToRemove.has(eid));
        const mergedPlanUpdatedAt = plan.updatedAt
          ? mergeHLC(plan.updatedAt, tombstoneHLC)
          : tombstoneHLC;
        await db.update(plansTable).set({
          nodeIds: newNodeIds,
          edgeIds: newEdgeIds,
          updatedAtWall: mergedPlanUpdatedAt.wall,
          updatedAtCounter: mergedPlanUpdatedAt.counter,
          updatedAtNode: mergedPlanUpdatedAt.node,
        }).where(eq(plansTable.id, plan.id));
        syncLocalChange('plans', 'update', plan.id).catch(() => {});
      }
    }
  }

  const mergedUpdatedAt = todo?.updatedAt
    ? mergeHLC(todo.updatedAt, tombstoneHLC)
    : tombstoneHLC;
  await db.update(todos).set({
    isDeleted: true,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(todos.id, id));
  syncLocalChange('todos', 'delete', id).catch(() => {});
}

export async function updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await getTodo(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(todos).set({
    status,
    startedAt: status === 'in_progress' ? new Date() : status === 'pending' ? null : undefined,
    completedAt: status === 'done' ? new Date() : undefined,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(todos.id, id));
  syncLocalChange('todos', 'update', id).catch(() => {});
}

export async function updateTodoSchedule(
  id: string,
  scheduledDate: Date | undefined
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await getTodo(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(todos).set({
    scheduledDate: scheduledDate,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(todos.id, id));
  syncLocalChange('todos', 'update', id).catch(() => {});
}

// ─── Virtual Instance Computation ───

export async function getVirtualTodosForDate(date: Date): Promise<Todo[]> {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const templates = await getRepeatTemplates();
  if (templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);
  const allOccRows = await db.select().from(
    (await import('./schema')).repeatOccurrences
  ) as any[];
  const allOccurrences = allOccRows.map((await import('./schema')).rowToRepeatOccurrence);
  const dateKey = d.toISOString().split('T')[0];
  const occurrencesByTemplate = new Map<string, (typeof allOccurrences)[0]>();
  for (const o of allOccurrences) {
    if (!templateIds.includes(o.templateId)) continue;
    const oDateKey = new Date(o.date).toISOString().split('T')[0];
    if (oDateKey === dateKey) {
      occurrencesByTemplate.set(o.templateId, o);
    }
  }

  const materializedIds = new Set<string>();
  for (const o of allOccurrences) {
    const oDateKey = new Date(o.date).toISOString().split('T')[0];
    if (oDateKey === dateKey && o.materializedTodoId) {
      materializedIds.add(o.materializedTodoId);
    }
  }

  const virtualTodos: Todo[] = [];
  for (const template of templates) {
    if (!template.repeatRule) continue;
    if (!dateMatchesRule(d, template.repeatRule)) continue;

    const occurrence = occurrencesByTemplate.get(template.id);
    if (occurrence?.materializedTodoId) {
      continue;
    }

    virtualTodos.push(computeVirtualTodo(template, d, occurrence));
  }

  return virtualTodos;
}

export async function getVirtualTodosForDateRange(
  start: Date,
  end: Date
): Promise<Todo[]> {
  const templates = await getRepeatTemplates();
  if (templates.length === 0) return [];

  const virtualTodos: Todo[] = [];
  const endTime = new Date(end).setHours(0, 0, 0, 0);

  const allOccRows = await db.select().from(
    (await import('./schema')).repeatOccurrences
  ) as any[];
  const allOccurrences = allOccRows.map((await import('./schema')).rowToRepeatOccurrence);
  const occurrencesByKey = new Map<string, (typeof allOccurrences)[0]>();
  for (const o of allOccurrences) {
    const key = `${o.templateId}:${new Date(o.date).toISOString().split('T')[0]}`;
    occurrencesByKey.set(key, o);
  }

  for (const template of templates) {
    if (!template.repeatRule) continue;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const ruleEnd = template.repeatRule.endDate
      ? new Date(template.repeatRule.endDate).setHours(0, 0, 0, 0)
      : undefined;

    while (current.getTime() <= endTime) {
      if (ruleEnd && current.getTime() > ruleEnd) break;

      if (dateMatchesRule(current, template.repeatRule)) {
        const dateKey = current.toISOString().split('T')[0];
        const occurrence = occurrencesByKey.get(`${template.id}:${dateKey}`);

        if (!occurrence?.materializedTodoId) {
          virtualTodos.push(computeVirtualTodo(template, new Date(current), occurrence));
        }
      }

      current.setDate(current.getDate() + 1);
    }
  }

  return virtualTodos;
}

// ─── Query Functions (merge real + virtual) ───

export async function getTodaysTodos(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rows = await db.select().from(todos).where(
    and(
      gte(todos.scheduledDate, today),
      lt(todos.scheduledDate, tomorrow),
      eq(todos.nodeType, 'task'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  const realTodos = rows.map(rowToTodo);

  const virtualTodos = await getVirtualTodosForDate(today);

  const allOccRows = await db.select().from(
    (await import('./schema')).repeatOccurrences
  ) as any[];
  const allOccurrences = allOccRows.map((await import('./schema')).rowToRepeatOccurrence);
  const materializedIds = new Set(
    allOccurrences
      .filter((o) => {
        const d = new Date(o.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime() && o.materializedTodoId;
      })
      .map((o) => o.materializedTodoId!)
  );

  const filteredReal = realTodos.filter((t) => !materializedIds.has(t.id));

  return [...filteredReal, ...virtualTodos];
}

export async function getTodosForDate(date: Date): Promise<Todo[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await db.select().from(todos).where(
    and(
      gte(todos.scheduledDate, start),
      lt(todos.scheduledDate, end),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  const realTodos = rows.map(rowToTodo);
  const virtualTodos = await getVirtualTodosForDate(date);

  return [...realTodos, ...virtualTodos];
}

export async function getUnscheduledTodos(): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(
      isNotNull(todos.scheduledDate),
      eq(todos.status, 'done'),
      eq(todos.nodeType, 'task'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  return rows.map(rowToTodo).filter((t) => !t.scheduledDate && t.status !== 'done');
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const rows = await db.select().from(todos).where(
    and(
      lt(todos.dueDate, now),
      eq(todos.status, 'done'),
      eq(todos.nodeType, 'task'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  return rows.map(rowToTodo).filter((t) => t.status !== 'done');
}

export async function getInProgressTodos(): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(
      eq(todos.status, 'in_progress'),
      eq(todos.nodeType, 'task'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  return rows.map(rowToTodo);
}

export async function getUnscheduledHighPriorityTodos(): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(
      isNotNull(todos.scheduledDate),
      eq(todos.status, 'done'),
      eq(todos.priority, 'high'),
      eq(todos.nodeType, 'task'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  return rows.map(rowToTodo).filter((t) => !t.scheduledDate && t.status !== 'done');
}

export async function getTodaysGoals(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rows = await db.select().from(todos).where(
    and(
      eq(todos.nodeType, 'goal'),
      eq(todos.isDeleted, false),
      isNotNull(todos.targetDate),
      gte(todos.targetDate, today),
      lt(todos.targetDate, tomorrow)
    )
  ) as any[];
  return rows.map(rowToTodo);
}

export async function getTodosByTag(tag: string): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(eq(todos.isDeleted, false)) as any[];
  return rows.map(rowToTodo).filter((t) => t.tags.includes(tag));
}

export async function getRepeatTemplates(): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(
    and(
      isNotNull(todos.repeatRule),
      eq(todos.nodeType, 'task'),
      eq(todos.isDeleted, false)
    )
  ) as any[];
  return rows.map(rowToTodo);
}

export async function updateRepeatRule(
  id: string,
  rule: RepeatRule | undefined
): Promise<void> {
  const nodeId = await getOrCreateDeviceId();
  const existing = await getTodo(id);
  const mergedUpdatedAt = existing?.updatedAt
    ? mergeHLC(existing.updatedAt, newHLC(nodeId))
    : newHLC(nodeId);
  await db.update(todos).set({
    repeatRule: rule,
    updatedAtWall: mergedUpdatedAt.wall,
    updatedAtCounter: mergedUpdatedAt.counter,
    updatedAtNode: mergedUpdatedAt.node,
  }).where(eq(todos.id, id));
  syncLocalChange('todos', 'update', id).catch(() => {});
}
