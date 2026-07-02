import { db } from './drizzle-adapter';
import { notifyDbOperation, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import type { TimeSlotStore, TimeSlotEntity } from '@utral/db-schema/timeslots';

// Map the engine's canonical entity names to desktop's syncLocalChange table
// naming (which uses the drizzle table names).
const SYNC_ENTITY: Record<TimeSlotEntity, string> = {
  todo: 'todos',
  todoLog: 'todoLogs',
  timeSlot: 'timeSlot',
};

/**
 * Build a desktop TimeSlotStore for the shared time-slot engine. Pass a
 * `nodeIdOverride` to force a specific device id (used by seeding on boot).
 */
export function makeTimeSlotStore(nodeIdOverride?: string): TimeSlotStore {
  return {
    db,
    getDeviceId: async () => nodeIdOverride ?? (await getOrCreateDeviceId()),
    trackChange: (entity, op, id) => {
      notifyDbOperation(SYNC_ENTITY[entity], op, id).catch(() => {});
    },
  };
}

export const timeSlotStore = makeTimeSlotStore();
