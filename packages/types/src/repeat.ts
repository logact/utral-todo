import type { Todo, RepeatRule, RepeatOccurrence } from './index.js';

export function formatDateKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function makeVirtualTodoId(templateId: string, date: Date): string {
  return `repeat:${templateId}:${formatDateKey(date)}`;
}

export function isVirtualTodoId(id: string): boolean {
  return id.startsWith('repeat:');
}

export function parseVirtualTodoId(id: string): { templateId: string; dateKey: string } | null {
  if (!isVirtualTodoId(id)) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  return { templateId: parts[1], dateKey: parts[2] };
}

export function dateMatchesRule(date: Date, rule: RepeatRule): boolean {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (rule.endDate) {
    const end = new Date(rule.endDate);
    end.setHours(0, 0, 0, 0);
    if (d > end) return false;
  }

  switch (rule.type) {
    case 'daily':
      return true;

    case 'weekly': {
      if (!rule.weekDays || rule.weekDays.length === 0) return false;
      return rule.weekDays.includes(d.getDay());
    }

    case 'every_n_days': {
      if (!rule.interval || rule.interval <= 0) return false;
      return true;
    }

    default:
      return false;
  }
}

export function getDatesForRule(
  rule: RepeatRule,
  startDate: Date,
  endDate: Date
): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  const ruleEnd = rule.endDate ? new Date(rule.endDate) : undefined;
  if (ruleEnd) ruleEnd.setHours(0, 0, 0, 0);

  const current = new Date(start);

  while (current <= end) {
    if (ruleEnd && current > ruleEnd) break;

    let include = false;

    switch (rule.type) {
      case 'daily':
        include = true;
        break;

      case 'weekly': {
        if (rule.weekDays && rule.weekDays.length > 0) {
          include = rule.weekDays.includes(current.getDay());
        }
        break;
      }

      case 'every_n_days': {
        if (rule.interval && rule.interval > 0) {
          const dayOfYear = Math.floor(
            (current.getTime() - new Date(current.getFullYear(), 0, 0).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          include = dayOfYear % rule.interval === 0;
        }
        break;
      }
    }

    if (include) {
      dates.push(new Date(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function computeVirtualTodo(
  template: Todo,
  date: Date,
  occurrence?: RepeatOccurrence
): Todo {
  const id = makeVirtualTodoId(template.id, date);
  return {
    id,
    nodeType: template.nodeType || 'task',
    pattern: template.pattern ?? 'task',
    parentId: template.parentId,
    title: template.title,
    description: template.description,
    status: occurrence?.status ?? 'pending',
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    tags: [...template.tags],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    dueDate: template.dueDate,
    scheduledDate: new Date(date),
    scheduledEndDate: template.scheduledEndDate,
    startedAt: occurrence?.status === 'in_progress' ? new Date() : undefined,
    completedAt: occurrence?.completedAt,
    repeatRule: undefined,
    order: template.order,
  };
}
