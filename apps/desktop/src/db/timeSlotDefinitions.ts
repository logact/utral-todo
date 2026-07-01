import {
  seedDefaultTimeSlots as engineSeedDefaultTimeSlots,
  getTimeSlotDefinitions as engineGetTimeSlotDefinitions,
  getTimeSlotDefinitionByMilestoneId as engineGetByMilestoneId,
  getTimeSlotDefinitionById as engineGetById,
  updateTimeSlotDefinition as engineUpdate,
  deleteTimeSlotDefinition as engineDelete,
} from '@utral/db-schema/timeslots';
import { makeTimeSlotStore, timeSlotStore } from './timeSlotStore';
import type { TimeSlotDefinition, TimeSlotConfig } from '../types';

export type { TimeSlotDefinition, TimeSlotConfig };

export function seedDefaultTimeSlots(nodeId?: string): Promise<void> {
  return engineSeedDefaultTimeSlots(makeTimeSlotStore(nodeId));
}

export function getTimeSlotDefinitions(): Promise<TimeSlotDefinition[]> {
  return engineGetTimeSlotDefinitions(timeSlotStore);
}

export function getTimeSlotDefinitionByMilestoneId(
  milestoneId: string
): Promise<TimeSlotDefinition | undefined> {
  return engineGetByMilestoneId(timeSlotStore, milestoneId);
}

export function getTimeSlotDefinitionById(
  id: string
): Promise<TimeSlotDefinition | undefined> {
  return engineGetById(timeSlotStore, id);
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
