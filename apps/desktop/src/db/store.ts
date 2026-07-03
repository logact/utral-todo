import { db } from './drizzle-adapter';
import { notifyDbOperation, getOrCreateDeviceId } from '../lib/sync/syncEngine';

import type { DbStore } from '@utral/db-schema/store';

function makeStoreBase(deviceId: string) {
  return {
    db,
    deviceId,
    notifyDbOperation: (table: string, op: 'create' | 'update' | 'delete', id: string) => {
      notifyDbOperation(table, op, id).catch(() => {});
    },
  };
}

export function makeDbStore(): DbStore {
  return makeStoreBase(getOrCreateDeviceId());
}

export const dbStore = makeDbStore();
