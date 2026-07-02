import { db } from '../db';
import { getDeviceId } from './database';
import { notifyDbOperation } from './sync';
import {
  seedDefaultTimeSlots as engineSeedDefaultTimeSlots,
  getTimeSlotDefinitions as engineGetTimeSlotDefinitions,
  getTimeSlotDefinitionById as engineGetById,
  getTimeSlotDefinitionByMilestoneId as engineGetByMilestoneId,
  updateTimeSlotDefinition as engineUpdate,
  deleteTimeSlotDefinition as engineDelete,
  ensureTimeSlotTodo as engineEnsureTimeSlotTodo,
  getTimeSlotTodo as engineGetTimeSlotTodo,
  migrateLegacySlotTodos as engineMigrateLegacySlotTodos,
  type TimeSlotStore,
  type TimeSlotEntity,
} from '@utral/db-schema/timeslots';
import type { TimeSlotDefinition, TimeSlotConfig, Todo } from '@utral/types';

export type { TimeSlotDefinition, TimeSlotConfig };



const timeSlotStore: TimeSlotStore = {
  db,
  getDeviceId,
  trackChange: (entity, op, id) => {
    notifyDbOperation(entity, op, id);
  },
};

export function seedDefaultTimeSlots(): Promise<void> {
  return engineSeedDefaultTimeSlots(timeSlotStore);
}

export function getTimeSlotDefinitions(): Promise<TimeSlotDefinition[]> {
  return engineGetTimeSlotDefinitions(timeSlotStore);
}

export function getTimeSlotDefinitionById(
  id: string
): Promise<TimeSlotDefinition | undefined> {
  return engineGetById(timeSlotStore, id);
}

export function getTimeSlotDefinitionByMilestoneId(
  milestoneId: string
): Promise<TimeSlotDefinition | undefined> {
  return engineGetByMilestoneId(timeSlotStore, milestoneId);
}

export function updateTimeSlotDefinition(
  id: string,
  changes: Partial<Omit<TimeSlotDefinition, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>>
): Promise<void> {
  return engineUpdate(timeSlotStore, id, changes);
}

export function deleteTimeSlotDefinition(id: string): Promise<void> {
  return engineDelete(timeSlotStore, id);
}

export function ensureTimeSlotTodo(
  slot: TimeSlotConfig,
  date = new Date()
): Promise<string> {
  return engineEnsureTimeSlotTodo(timeSlotStore, slot, date);
}

export function getTimeSlotTodo(slot: TimeSlotConfig): Promise<Todo | undefined> {
  return engineGetTimeSlotTodo(timeSlotStore, slot);
}

export function migrateLegacySlotTodos(): Promise<void> {
  return engineMigrateLegacySlotTodos(timeSlotStore);
}
