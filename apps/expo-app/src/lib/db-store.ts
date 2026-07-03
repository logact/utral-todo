import { db } from '../db';
import { notifyDbOperation } from './sync';
import type { DbStore } from '@utral/db-schema/store';

let _dbStore: DbStore | undefined;

export function initDbStore(deviceId: string): void {
  _dbStore = {
    db,
    deviceId,
    notifyDbOperation: (table: string, op: 'create' | 'update' | 'delete', id: string) => {
      notifyDbOperation(table, op, id).catch(() => {});
    },
  };
}

export function getDbStore(): DbStore {
  if (!_dbStore) {
    throw new Error('DbStore not initialized. Call initDbStore() during app startup.');
  }
  return _dbStore;
}

/**
 * Lazily-resolving store reference. Reading any property before `initDbStore()`
 * has been called throws a clear error, while keeping the `DbStore` type for
 * existing consumers.
 */
export const dbStore: DbStore = new Proxy({} as DbStore, {
  get(_target, prop) {
    return getDbStore()[prop as keyof DbStore];
  },
});
