import { DEFAULT_TIME_SLOTS } from './default-time-slots.js';
import type { Todo } from './index.js';

export { DEFAULT_TIME_SLOTS };

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

/**
 * @deprecated Use DEFAULT_TIME_SLOTS or load definitions from storage.
 */
export const TIME_SLOTS = DEFAULT_TIME_SLOTS;

export function getTimeSlotForTodo(
  todo: Todo,
  slots: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
): string | null {
  if (!todo.scheduledDate) return null;
  const date = new Date(todo.scheduledDate);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  for (const slot of slots) {
    const startInMinutes = slot.startHour * 60 + slot.startMinute;
    const endInMinutes = slot.endHour * 60 + slot.endMinute;
    if (timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes) {
      return slot.id;
    }
  }
  return null;
}

export function isTimeSlotTodo(todo: Todo): boolean {
  return todo.pattern === 'timeSlot';
}

export function getTimeSlotScheduleDate(
  slot: TimeSlotConfig,
  date = new Date()
): Date {
  const d = new Date(date);
  d.setHours(slot.startHour, slot.startMinute, 0, 0);
  return d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Deterministic milestone id for a boundary time: `timeslot:HHmm`. Independent of the calendar/create date. */
export function getTimeSlotMilestoneId(hour: number, minute: number): string {
  return `timeslot:${pad2(hour)}${pad2(minute)}`;
}

/** Milestone id for a slot's start boundary. */
export function getTimeSlotStartMilestoneId(slot: TimeSlotConfig): string {
  return getTimeSlotMilestoneId(slot.startHour, slot.startMinute);
}

/** Milestone id for a slot's end boundary. */
export function getTimeSlotEndMilestoneId(slot: TimeSlotConfig): string {
  return getTimeSlotMilestoneId(slot.endHour, slot.endMinute);
}

export function getTimeSlotByMilestoneId(
  milestoneId: string,
  slots: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
): TimeSlotConfig | undefined {
  return slots.find((s) => s.milestoneId === milestoneId);
}

export function groupTodosByTimeSlot(
  todos: Todo[],
  slots: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>();
  for (const slot of slots) {
    groups.set(slot.id, []);
  }

  for (const todo of todos) {
    const slotId = getTimeSlotForTodo(todo, slots);
    if (slotId) {
      groups.get(slotId)!.push(todo);
    }
  }

  for (const [, items] of groups) {
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return groups;
}
