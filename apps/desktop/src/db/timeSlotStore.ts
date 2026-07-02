import { db } from './drizzle-adapter';
import { notifyDbOperation, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import type { TimeSlotStore, TimeSlotEntity } from '@utral/db-schema/timeslots';

import { TABLE_NAME_MAP } from '@utral/sync-share';

// Map the engine's canonical entity names to desktop's syncLocalChange table
// naming. The values are already canonical sync names; the map is used so a
// legacy local name, if ever introduced, is normalized before reaching sync.
const SYNC_ENTITY: Record<TimeSlotEntity, string> = {
  todo: TABLE_NAME_MAP.todo,
  todoLog: TABLE_NAME_MAP.todoLog,
  timeSlot: TABLE_NAME_MAP.timeSlot,
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
