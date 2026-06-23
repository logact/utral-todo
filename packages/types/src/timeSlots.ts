import type { Todo } from './index.js';

export interface TimeSlotConfig {
  id: string;
  milestoneId: string;
  title: string;
  time: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const TIME_SLOTS: TimeSlotConfig[] = [
  {
    id: 'slot-morning',
    milestoneId: 'system:day-startup',
    title: 'Day Startup Plan',
    time: '06:00',
    startHour: 6,
    startMinute: 0,
    endHour: 12,
    endMinute: 0,
  },
  {
    id: 'slot-midday',
    milestoneId: 'system:morning-summary',
    title: 'Morning Summary',
    time: '12:00',
    startHour: 12,
    startMinute: 0,
    endHour: 13,
    endMinute: 0,
  },
  {
    id: 'slot-afternoon',
    milestoneId: 'system:afternoon-startup',
    title: 'Afternoon Startup Plan',
    time: '13:00',
    startHour: 13,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
  },
  {
    id: 'slot-late-afternoon',
    milestoneId: 'system:afternoon-summary',
    title: 'Afternoon Summary',
    time: '17:00',
    startHour: 17,
    startMinute: 0,
    endHour: 19,
    endMinute: 0,
  },
  {
    id: 'slot-evening',
    milestoneId: 'system:evening-startup',
    title: 'Evening Startup',
    time: '19:00',
    startHour: 19,
    startMinute: 0,
    endHour: 21,
    endMinute: 30,
  },
  {
    id: 'slot-night',
    milestoneId: 'system:evening-summary',
    title: 'Evening Summary',
    time: '21:30',
    startHour: 21,
    startMinute: 30,
    endHour: 24,
    endMinute: 0,
  },
];

export function getTimeSlotForTodo(todo: Todo): string | null {
  if (!todo.scheduledDate) return null;
  const date = new Date(todo.scheduledDate);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  for (const slot of TIME_SLOTS) {
    const startInMinutes = slot.startHour * 60 + slot.startMinute;
    const endInMinutes = slot.endHour * 60 + slot.endMinute;
    if (timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes) {
      return slot.id;
    }
  }
  return null;
}

export function groupTodosByTimeSlot(todos: Todo[]): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>();
  for (const slot of TIME_SLOTS) {
    groups.set(slot.id, []);
  }

  for (const todo of todos) {
    const slotId = getTimeSlotForTodo(todo);
    if (slotId) {
      groups.get(slotId)!.push(todo);
    }
  }

  // Sort within each slot by order
  for (const [, items] of groups) {
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return groups;
}
