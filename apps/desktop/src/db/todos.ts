import { db } from './database';
import { onLocalChange } from './syncEngine';
import { createPlan } from './plans';
import { dateMatchesRule, computeVirtualTodo } from '../types';
import type { Todo, TodoStatus, Priority, RepeatRule, NodeType, GoalStatus, TaskPattern, Plan } from '../types';

export const ROOT_GOAL_ID = 'system:root-goal';

export async function createTodo(
  title: string,
  options?: {
    nodeType?: NodeType;
    pattern?: TaskPattern;
    parentId?: string;
    projectId?: string;
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
  const now = new Date();
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
    createdAt: now,
    updatedAt: now,
    projectId: options?.projectId,
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
  };
  await db.todos.add(todo);
  onLocalChange('todos', 'create', todo.id).catch(() => {});
  return todo;
}

export async function createGoal(
  title: string,
  options?: {
    parentId?: string;
    projectId?: string;
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
    projectId?: string;
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
  return db.todos.toArray();
}

export async function getRootTodos(): Promise<Todo[]> {
  return db.todos.filter((t) => !t.parentId).toArray();
}

export async function getRootGoal(): Promise<Todo | undefined> {
  return db.todos.filter((t) => t.isRootGoal === true).first();
}

export async function ensureRootGoal(): Promise<Todo> {
  const existing = await getRootGoal();
  if (existing) return existing;

  const now = new Date();
  const rootGoal: Todo = {
    id: ROOT_GOAL_ID,
    nodeType: 'goal',
    title: 'Root Goal',
    description: '',
    isRootGoal: true,
    goalStatus: 'active',
    tags: [],
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.todos.add(rootGoal);
  onLocalChange('todos', 'create', rootGoal.id).catch(() => {});

  const plan: Plan = {
    id: crypto.randomUUID(),
    goalTodoId: rootGoal.id,
    title: 'Root Road',
    nodeIds: [],
    edgeIds: [],
    isSystemPlan: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.plans.add(plan);
  onLocalChange('plans', 'create', plan.id).catch(() => {});

  await db.todos.update(rootGoal.id, { activePlanId: plan.id, updatedAt: new Date() });
  onLocalChange('todos', 'update', rootGoal.id).catch(() => {});

  return { ...rootGoal, activePlanId: plan.id };
}

export async function getSubTodos(parentId: string): Promise<Todo[]> {
  const todos = await db.todos.where('parentId').equals(parentId).toArray();
  return todos.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function getSubGoals(parentId: string): Promise<Todo[]> {
  const todos = await db.todos
    .where('parentId')
    .equals(parentId)
    .and((t) => t.nodeType === 'goal')
    .toArray();
  return todos.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

    const relations = await db.relations.toArray();
    const sourceRel = relations.find(
      (r) => r.toTodoId === currentId && r.type === 'source_from'
    );
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
  for (let i = 0; i < orderedIds.length; i++) {
    await db.todos.update(orderedIds[i], { order: i, updatedAt: new Date() });
    onLocalChange('todos', 'update', orderedIds[i]).catch(() => {});
  }
}

export async function reorderTodos(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.todos.update(orderedIds[i], { order: i, updatedAt: new Date() });
    onLocalChange('todos', 'update', orderedIds[i]).catch(() => {});
  }
}

export async function getTodo(id: string): Promise<Todo | undefined> {
  return db.todos.get(id);
}

export async function updateTodo(id: string, updates: Partial<Todo>): Promise<void> {
  const existing = await db.todos.get(id);
  if (existing?.isRootGoal) {
    throw new Error('Cannot modify the root goal');
  }
  await db.todos.update(id, { ...updates, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}

export async function bulkUpdateTodoProject(
  todoIds: string[],
  projectId: string | undefined
): Promise<void> {
  for (const id of todoIds) {
    await db.todos.update(id, { projectId, updatedAt: new Date() });
    onLocalChange('todos', 'update', id).catch(() => {});
  }
}

export async function deleteTodo(id: string): Promise<void> {
  const todo = await db.todos.get(id);
  if (todo?.isRootGoal) {
    throw new Error('Cannot delete the root goal');
  }

  if (todo?.nodeType === 'goal') {
    const goalPlans = await db.plans.where('goalTodoId').equals(id).toArray();
    for (const plan of goalPlans) {
      await db.plans.delete(plan.id);
      onLocalChange('plans', 'delete', plan.id).catch(() => {});
    }
  } else {
    const plans = await db.plans.toArray();
    const edges = await db.actionEdges.toArray();
    for (const plan of plans) {
      if (plan.nodeIds.includes(id)) {
        const newNodeIds = plan.nodeIds.filter((tid) => tid !== id);
        const edgeIdsToRemove = new Set(
          plan.edgeIds.filter((eid) => {
            const edge = edges.find((e) => e.id === eid);
            return edge?.fromTodoId === id || edge?.toTodoId === id;
          })
        );
        const newEdgeIds = plan.edgeIds.filter((eid) => !edgeIdsToRemove.has(eid));
        await db.plans.update(plan.id, {
          nodeIds: newNodeIds,
          edgeIds: newEdgeIds,
          updatedAt: new Date(),
        });
        onLocalChange('plans', 'update', plan.id).catch(() => {});
      }
    }
  }

  await db.todos.delete(id);
  onLocalChange('todos', 'delete', id).catch(() => {});
}

export async function updateTodoStatus(id: string, status: TodoStatus): Promise<void> {
  const updates: Partial<Todo> = { status, updatedAt: new Date() };
  if (status === 'in_progress') updates.startedAt = new Date();
  if (status === 'pending') updates.startedAt = undefined;
  if (status === 'done') updates.completedAt = new Date();
  await db.todos.update(id, updates);
  onLocalChange('todos', 'update', id).catch(() => {});
}

export async function updateTodoSchedule(
  id: string,
  scheduledDate: Date | undefined
): Promise<void> {
  await db.todos.update(id, { scheduledDate, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}

// ─── Virtual Instance Computation ───

export async function getVirtualTodosForDate(date: Date): Promise<Todo[]> {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const templates = await getRepeatTemplates();
  if (templates.length === 0) return [];

  // Get all occurrences for these templates on this date in one query
  const templateIds = templates.map((t) => t.id);
  const allOccurrences = await db.repeatOccurrences.toArray();
  const dateKey = d.toISOString().split('T')[0];
  const occurrencesByTemplate = new Map<string, typeof allOccurrences[0]>();
  for (const o of allOccurrences) {
    if (!templateIds.includes(o.templateId)) continue;
    const oDateKey = new Date(o.date).toISOString().split('T')[0];
    if (oDateKey === dateKey) {
      occurrencesByTemplate.set(o.templateId, o);
    }
  }

  // Get materialized todo IDs for this date
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

    // Check if there's already a materialized todo for this date
    const occurrence = occurrencesByTemplate.get(template.id);
    if (occurrence?.materializedTodoId) {
      // The materialized todo will be fetched separately
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

  // Pre-load all occurrences in range
  const allOccurrences = await db.repeatOccurrences.toArray();
  const occurrencesByKey = new Map<string, typeof allOccurrences[0]>();
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

  const realTodos = await db.todos
    .where('scheduledDate')
    .between(today, tomorrow)
    .and((t) => t.nodeType === 'task')
    .toArray();

  const virtualTodos = await getVirtualTodosForDate(today);

  // Filter out virtual todos whose template is already represented by a materialized todo
  const materializedIds = new Set(
    (await db.repeatOccurrences.toArray())
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

  const realTodos = await db.todos.where('scheduledDate').between(start, end).toArray();
  const virtualTodos = await getVirtualTodosForDate(date);

  // Filter out materialized todos from real results (they're already there)
  return [...realTodos, ...virtualTodos];
}

export async function getUnscheduledTodos(): Promise<Todo[]> {
  return db.todos
    .filter((t) => !t.scheduledDate && t.status !== 'done' && t.nodeType === 'task')
    .toArray();
}

export async function getOverdueTodos(): Promise<Todo[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return db.todos
    .where('dueDate')
    .below(now)
    .and((t) => t.status !== 'done' && t.nodeType === 'task')
    .toArray();
}

export async function getInProgressTodos(): Promise<Todo[]> {
  return db.todos
    .where('status')
    .equals('in_progress')
    .and((t) => t.nodeType === 'task')
    .toArray();
}

export async function getUnscheduledHighPriorityTodos(): Promise<Todo[]> {
  return db.todos
    .filter((t) => !t.scheduledDate && t.status !== 'done' && t.priority === 'high' && t.nodeType === 'task')
    .toArray();
}

export async function getTodaysGoals(): Promise<Todo[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return db.todos
    .filter((t) =>
      t.nodeType === 'goal' &&
      t.targetDate != null &&
      new Date(t.targetDate) >= today &&
      new Date(t.targetDate) < tomorrow
    )
    .toArray();
}

export async function getTodosByTag(tag: string): Promise<Todo[]> {
  return db.todos.filter((t) => t.tags.includes(tag)).toArray();
}

export async function getRepeatTemplates(): Promise<Todo[]> {
  return db.todos
    .filter((t) => t.repeatRule !== undefined && t.nodeType === 'task')
    .toArray();
}

export async function updateRepeatRule(
  id: string,
  rule: RepeatRule | undefined
): Promise<void> {
  await db.todos.update(id, { repeatRule: rule, updatedAt: new Date() });
  onLocalChange('todos', 'update', id).catch(() => {});
}
