import type { Todo, TodoRelation, TodoLog, RepeatRule, Project, ActionEdge, Pluse, TimerSession, Roadmap } from '../types';

export function parseDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
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
  return {
    id: t.id as string,
    nodeType: nodeType as Todo['nodeType'],
    projectId: t.projectId as string | undefined,
    parentId: t.parentId as string | undefined,
    title: t.title as string,
    description: t.description as string,
    status: (t.status as Todo['status']) ?? 'pending',
    priority: (t.priority as Todo['priority']) ?? 'medium',
    estimatedMinutes: (t.estimatedMinutes as number) ?? 60,
    tags: (t.tags as string[]) ?? [],
    createdAt: parseDate(t.createdAt)!,
    updatedAt: parseDate(t.updatedAt) ?? parseDate(t.createdAt)!,
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
  return {
    id: r.id as string,
    fromTodoId: r.fromTodoId as string,
    toTodoId: r.toTodoId as string,
    type: r.type as TodoRelation['type'],
    createdAt: parseDate(r.createdAt)!,
    updatedAt: parseDate(r.updatedAt) ?? parseDate(r.createdAt)!,
  };
}

export function parseLog(data: unknown): TodoLog {
  const l = data as Record<string, unknown>;
  return {
    id: l.id as string,
    todoId: l.todoId as string,
    type: l.type as TodoLog['type'],
    content: l.content as string,
    minutesSpent: (l.minutesSpent as number | undefined) ?? undefined,
    metadata: (l.metadata as Record<string, unknown> | undefined) ?? undefined,
    createdAt: parseDate(l.createdAt)!,
    updatedAt: parseDate(l.updatedAt) ?? parseDate(l.createdAt)!,
  };
}

export function parseProject(data: unknown): Project {
  const p = data as Record<string, unknown>;
  return {
    id: p.id as string,
    title: p.title as string,
    description: p.description as string,
    color: p.color as string,
    status: p.status as Project['status'],
    deadline: parseDate(p.deadline),
    createdAt: parseDate(p.createdAt)!,
    updatedAt: parseDate(p.updatedAt) ?? parseDate(p.createdAt)!,
  };
}

export function parseActionEdge(data: unknown): ActionEdge {
  const e = data as Record<string, unknown>;
  return {
    id: e.id as string,
    fromTodoId: e.fromTodoId as string,
    toTodoId: e.toTodoId as string,
    type: e.type as ActionEdge['type'],
    createdAt: parseDate(e.createdAt)!,
    updatedAt: parseDate(e.updatedAt) ?? parseDate(e.createdAt)!,
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
  return {
    id: p.id as string,
    name: p.name as string,
    description: p.description as string,
    intervals: p.intervals as number[],
    repeatCount: (p.repeatCount as number) ?? 1,
    intervalTodos,
    autoAdvance: (p.autoAdvance as boolean | undefined) ?? true,
    createdAt: parseDate(p.createdAt)!,
    updatedAt: parseDate(p.updatedAt) ?? parseDate(p.createdAt)!,
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
    createdAt: parseDate(s.createdAt)!,
    updatedAt: parseDate(s.updatedAt)!,
  };
}

export function parseRoadmap(data: unknown): Roadmap {
  const r = data as Record<string, unknown>;
  const phasesRaw = r.phases as Array<Record<string, unknown>> | undefined;
  const phases: Roadmap['phases'] = (phasesRaw ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    order: (p.order as number) ?? 0,
    todoIds: (p.todoIds as string[]) ?? [],
    startAt: parseDate(p.startAt),
    endAt: parseDate(p.endAt),
  }));
  return {
    id: r.id as string,
    goalTodoId: r.goalTodoId as string,
    phases,
    createdAt: parseDate(r.createdAt)!,
    updatedAt: parseDate(r.updatedAt) ?? parseDate(r.createdAt)!,
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
