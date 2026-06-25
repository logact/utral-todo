import { db, schema } from '../db/index.js';
import { isNotNull, and, gte, lt, inArray } from 'drizzle-orm';
import { dateMatchesRule, computeVirtualTodo, type RepeatRule } from '@utral/types';

export interface VirtualTodo {
  id: string;
  nodeType: string;
  parentId: string | null;
  title: string;
  description: string;
  status: string | null;
  priority: string | null;
  estimatedMinutes: number | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date | null;
  scheduledDate: Date | null;
  scheduledEndDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  repeatRule: any;
  order: number;
  motivation?: string | null;
  successCriteria?: string | null;
  targetDate?: Date | null;
  goalStatus?: string | null;
}

function toTodoLike(template: typeof schema.todo.$inferSelect): VirtualTodo {
  return {
    id: template.id,
    nodeType: template.nodeType,
    parentId: template.parentId,
    title: template.title,
    description: template.description,
    status: template.status,
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    tags: (template.tags as string[]) ?? [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    dueDate: template.dueDate,
    scheduledDate: template.scheduledDate,
    scheduledEndDate: template.scheduledEndDate,
    startedAt: template.startedAt,
    completedAt: template.completedAt,
    repeatRule: template.repeatRule ?? undefined,
    order: template.order,
    motivation: template.motivation,
    successCriteria: template.successCriteria,
    targetDate: template.targetDate,
    goalStatus: template.goalStatus,
  };
}

export async function getVirtualTodosForDate(date: Date): Promise<VirtualTodo[]> {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const templates = await db.select().from(schema.todo).where(isNotNull(schema.todo.repeatRule));

  if (templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);

  // Get all occurrences for these templates
  const occurrences = await db.select().from(schema.repeatOccurrence).where(
    and(
      inArray(schema.repeatOccurrence.templateId, templateIds),
      gte(schema.repeatOccurrence.date, new Date(d.getFullYear(), d.getMonth(), d.getDate())),
      lt(schema.repeatOccurrence.date, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)),
    ),
  );

  const occurrencesByTemplate = new Map<string, typeof schema.repeatOccurrence.$inferSelect>();
  for (const o of occurrences) {
    occurrencesByTemplate.set(o.templateId, o);
  }

  const virtualTodos: VirtualTodo[] = [];

  for (const template of templates) {
    if (!template.repeatRule) continue;

    const rule = template.repeatRule as RepeatRule;

    if (!dateMatchesRule(d, rule)) continue;

    const occurrence = occurrencesByTemplate.get(template.id);
    if (occurrence?.materializedTodoId) continue;

    const todoLike = toTodoLike(template);
    const computed = computeVirtualTodo(todoLike as never, d, occurrence as never);
    virtualTodos.push(computed as unknown as VirtualTodo);
  }

  return virtualTodos;
}

export async function getVirtualTodosForDateRange(
  start: Date,
  end: Date
): Promise<VirtualTodo[]> {
  const templates = await db.select().from(schema.todo).where(isNotNull(schema.todo.repeatRule));

  if (templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);
  const startTime = new Date(start).setHours(0, 0, 0, 0);
  const endTime = new Date(end).setHours(0, 0, 0, 0);

  const occurrences = await db.select().from(schema.repeatOccurrence).where(
    and(
      inArray(schema.repeatOccurrence.templateId, templateIds),
      gte(schema.repeatOccurrence.date, new Date(startTime)),
      lt(schema.repeatOccurrence.date, new Date(endTime + 24 * 60 * 60 * 1000)),
    ),
  );

  const occurrencesByKey = new Map<string, typeof schema.repeatOccurrence.$inferSelect>();
  for (const o of occurrences) {
    const dateKey = new Date(o.date).toISOString().split('T')[0];
    occurrencesByKey.set(`${o.templateId}:${dateKey}`, o);
  }

  const virtualTodos: VirtualTodo[] = [];

  for (const template of templates) {
    if (!template.repeatRule) continue;

    const rule = template.repeatRule as RepeatRule;

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const ruleEnd = rule.endDate ? new Date(rule.endDate).setHours(0, 0, 0, 0) : undefined;

    while (current.getTime() <= endTime) {
      if (ruleEnd && current.getTime() > ruleEnd) break;

      if (dateMatchesRule(current, rule)) {
        const dateKey = current.toISOString().split('T')[0];
        const occurrence = occurrencesByKey.get(`${template.id}:${dateKey}`);

        if (!occurrence?.materializedTodoId) {
          const todoLike = toTodoLike(template);
          const computed = computeVirtualTodo(todoLike as never, new Date(current), occurrence as never);
          virtualTodos.push(computed as unknown as VirtualTodo);
        }
      }

      current.setDate(current.getDate() + 1);
    }
  }

  return virtualTodos;
}
