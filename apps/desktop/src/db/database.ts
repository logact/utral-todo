import { db, initDatabase as runMigrations } from './drizzle-adapter';
import {
  todos, todoRelations, todoLogs, actionEdges, plans, pluses, repeatOccurrences,
  hlcState, syncConfig, syncQueue, syncState,
} from './schema';
import { eq } from 'drizzle-orm';
import { notifyDbOperation, getOrCreateDeviceId } from '../lib/sync/syncEngine';
import { migrateLegacySyncConfig } from './sync';
import { bootstrapApp, type BootstrapStore } from '@utral/db-schema/bootstrap';

export { db };

export async function initDatabase(): Promise<void> {
  await runMigrations();
  await migrateLegacySyncConfig();

  const store: BootstrapStore = {
    db,
    getDeviceId: getOrCreateDeviceId,
    trackChange: (entity, op, id) => {
      notifyDbOperation(entity, op, id).catch((e) => {
        debugger
        console.error('Failed to notify DB operation:', e);
      });
    },
  };

  await bootstrapApp(store);
}

export async function clearAllData(): Promise<void> {
  await db.delete(todos);
  await db.delete(todoRelations);
  await db.delete(todoLogs);
  await db.delete(actionEdges);
  await db.delete(plans);
  await db.delete(pluses);
  await db.delete(repeatOccurrences);
  await db.delete(hlcState);
  await db.delete(syncConfig);
  await db.delete(syncQueue);
  await db.delete(syncState);
}

export async function resetAllData(): Promise<void> {
  // Stop sync first so no queued operations are sent while we wipe.
  const { stop } = await import('../lib/sync/syncEngine');
  stop();

  // Clear every local table (domain + sync infra).
  await clearAllData();

  // Wipe cached device id from localStorage. Sync configuration lives in the
  // `sync_config` table and is already cleared by clearAllData() above.
  localStorage.removeItem('syncDeviceId');

  // Recreate the default dataset so the app is usable immediately, not just on relaunch.
  await runMigrations();

  const store: BootstrapStore = {
    db,
    getDeviceId: getOrCreateDeviceId,
    trackChange: (entity, op, id) => {
      notifyDbOperation(entity, op, id).catch((e) => {console.error('Failed to notify DB operation:', e);});
    },
  };

  await bootstrapApp(store);
}

export async function garbageCollectTombstones(): Promise<void> {
  const tables = [todos, todoRelations, todoLogs, actionEdges, plans, pluses, repeatOccurrences] as const;

  for (const table of tables) {
    await db.delete(table).where(
      eq(table.isDeleted, true)
    );
  }
}

export { todos as todoTable } from './schema';
export type { Todo, TodoRelation, TodoLog, ActionEdge, Plan, Pluse, RepeatOccurrence } from './schema';
