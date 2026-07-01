import {
  getTimeSlotTodo as engineGetTimeSlotTodo,
  ensureTimeSlotTodo as engineEnsureTimeSlotTodo,
  migrateLegacySlotTodos as engineMigrateLegacySlotTodos,
} from '@utral/db-schema/timeslots';
import { timeSlotStore } from './timeSlotStore';
import type { TimeSlotConfig, Todo } from '../types';

export function getTimeSlotTodo(slot: TimeSlotConfig): Promise<Todo | undefined> {
  return engineGetTimeSlotTodo(timeSlotStore, slot);
}

export function ensureTimeSlotTodo(
  slot: TimeSlotConfig,
  date = new Date()
): Promise<string> {
  return engineEnsureTimeSlotTodo(timeSlotStore, slot, date);
}

export function migrateLegacySlotTodos(): Promise<void> {
  return engineMigrateLegacySlotTodos(timeSlotStore);
}
