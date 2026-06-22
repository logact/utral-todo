import type { Todo, TodoRelation, TodoLog, RepeatRule, ActionEdge, Pluse, TimerSession, Plan, HLCTimestamp } from '../types';
import { newHLC, stringToHLC, dateToHLC } from '../types';

export function parseDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

export function parseHLC(value: unknown, nodeId: string = 'server'): HLCTimestamp {
  if (value === null || value === undefined) return newHLC(nodeId);
  if (typeof value === 'object' && value !== null && 'wall' in value && 'counter' in value && 'node' in value) {
    return value as HLCTimestamp;
  }
  if (typeof value === 'string') {
    if (value.includes(':')) {
      const parts = value.split(':');
      if (parts.length === 3 && !isNaN(Number(parts[0]))) {
        return stringToHLC(value);
      }
    }
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return dateToHLC(date, nodeId);
    }
  }
  return newHLC(nodeId);
}

export function parseRepeatRule(data: unknown): RepeatRule | undefined {
  if (!data) return undefined;
  const r = data as Record<string, unknown>;
  return {
    type: r.type as 'daily' | 'weekly' | 'every_n_days',
    weekDays: r.weekDays as number[] | undefined,
    interval: r.interval as number | undefined,
    endDate: parseDate(r.endDate),
  };
}

export function parseTodo(data: unknown): Todo {
  const t = data as Record<string, unknown>;
  const nodeType = (t.nodeType as string) || (t.isGoal ? 'goal' : 'task');
  const createdAt = parseHLC(t.createdAt);
  return {
    id: t.id as string,
    nodeType: nodeType as Todo['nodeType'],
    parentId: t.parentId as string | undefined,
    activePlanId: t.activePlanId as string | undefined,
    title: t.title as string,
    description: t.description as string,
    status: (t.status as Todo['status']) ?? 'pending',
    priority: (t.priority as Todo['priority']) ?? 'medium',
    estimatedMinutes: (t.estimatedMinutes as number) ?? 60,
    tags: (t.tags as string[]) ?? [],
    createdAt,
    updatedAt: t.updatedAt ? parseHLC(t.updatedAt) : createdAt,
    dueDate: parseDate(t.dueDate),
    scheduledDate: parseDate(t.scheduledDate),
    scheduledEndDate: parseDate(t.scheduledEndDate),
    startedAt: parseDate(t.startedAt),
    completedAt: parseDate(t.completedAt),
    repeatRule: parseRepeatRule(t.repeatRule),
    order: (t.order as number) ?? 0,
    motivation: t.motivation as string | undefined,
    successCriteria: t.successCriteria as string | undefined,
    targetDate: parseDate(t.targetDate),
    goalStatus: t.goalStatus as Todo['goalStatus'],
    pattern: (t.pattern as Todo['pattern']) ?? 'task',
  };
}

export function parseRelation(data: unknown): TodoRelation {
  const r = data as Record<string, unknown>;
  const createdAt = parseHLC(r.createdAt);
  return {
    id: r.id as string,
    fromTodoId: r.fromTodoId as string,
    toTodoId: r.toTodoId as string,
    type: r.type as TodoRelation['type'],
    createdAt,
    updatedAt: r.updatedAt ? parseHLC(r.updatedAt) : createdAt,
  };
}

export function parseLog(data: unknown): TodoLog {
  const l = data as Record<string, unknown>;
  const createdAt = parseHLC(l.createdAt);
  return {
    id: l.id as string,
    todoId: l.todoId as string,
    type: l.type as TodoLog['type'],
    content: l.content as string,
    minutesSpent: (l.minutesSpent as number | undefined) ?? undefined,
    metadata: (l.metadata as Record<string, unknown> | undefined) ?? undefined,
    createdAt,
    updatedAt: l.updatedAt ? parseHLC(l.updatedAt) : createdAt,
  };
}

export function parseActionEdge(data: unknown): ActionEdge {
  const e = data as Record<string, unknown>;
  const createdAt = parseHLC(e.createdAt);
  return {
    id: e.id as string,
    fromTodoId: e.fromTodoId as string,
    toTodoId: e.toTodoId as string,
    type: e.type as ActionEdge['type'],
    createdAt,
    updatedAt: e.updatedAt ? parseHLC(e.updatedAt) : createdAt,
  };
}

export function parsePluse(data: unknown): Pluse {
  const p = data as Record<string, unknown>;
  const intervalTodosRaw = p.intervalTodos as Record<string, string> | undefined;
  let intervalTodos: Record<number, string> | undefined;
  if (intervalTodosRaw) {
    intervalTodos = {};
    for (const key of Object.keys(intervalTodosRaw)) {
      const idx = parseInt(key, 10);
      if (!isNaN(idx)) {
        intervalTodos[idx] = intervalTodosRaw[key];
      }
    }
  }
  const createdAt = parseHLC(p.createdAt);
  return {
    id: p.id as string,
    name: p.name as string,
    description: p.description as string,
    intervals: p.intervals as number[],
    repeatCount: (p.repeatCount as number) ?? 1,
    intervalTodos,
    autoAdvance: (p.autoAdvance as boolean | undefined) ?? true,
    createdAt,
    updatedAt: p.updatedAt ? parseHLC(p.updatedAt) : createdAt,
  };
}

export function parseTimerSession(data: unknown): TimerSession {
  const s = data as Record<string, unknown>;
  return {
    id: s.id as string,
    type: s.type as TimerSession['type'],
    name: s.name as string,
    pluseId: (s.pluseId as string | undefined) ?? undefined,
    todoId: (s.todoId as string | undefined) ?? undefined,
    intervals: (s.intervals as number[] | undefined) ?? undefined,
    repeatCount: (s.repeatCount as number) ?? 1,
    startedAt: parseDate(s.startedAt)!,
    pausedAt: parseDate(s.pausedAt),
    completedAt: parseDate(s.completedAt),
    currentIndex: (s.currentIndex as number) ?? 0,
    elapsedSeconds: (s.elapsedSeconds as number) ?? 0,
    status: s.status as TimerSession['status'],
    createdAt: parseHLC(s.createdAt),
    updatedAt: parseHLC(s.updatedAt),
  };
}

export function parsePlan(data: unknown): Plan {
  const p = data as Record<string, unknown>;
  const nodeIds = (p.nodeIds as string[]) ?? (p.todoIds as string[]) ?? [];
  const createdAt = parseHLC(p.createdAt);
  return {
    id: p.id as string,
    goalTodoId: p.goalTodoId as string,
    title: (p.title as string) || 'Untitled Plan',
    nodeIds,
    edgeIds: (p.edgeIds as string[]) ?? [],
    createdAt,
    updatedAt: p.updatedAt ? parseHLC(p.updatedAt) : createdAt,
  };
}

// Sync helper: fetch from remote server
export async function syncFetch(path: string, options?: RequestInit): Promise<Response> {
  const serverUrl = localStorage.getItem('syncServerUrl') || '';
  if (!serverUrl) {
    throw new Error('Sync server URL not configured');
  }
  const url = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  const res = await fetch(`${url}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res;
}
