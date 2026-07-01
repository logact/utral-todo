import { SyncHandler } from '@utral/sync-server';
import { DrizzlePgSyncStorage } from './pg-storage.js';
import { db, schema } from '../db/index.js';
import { eq, and, isNotNull, gt, lt } from 'drizzle-orm';

const tables: Record<string, any> = Object.fromEntries(
  Object.entries(schema).filter(([, v]) => v && typeof v === 'object' && '_' in v),
);

const storage = new DrizzlePgSyncStorage({
  db,
  schema: tables,
  syncEventTable: schema.syncEvent,
  eq,
  and,
  isNotNull,
  gt,
  lt,
});

export const syncHandler = new SyncHandler({
  storage,
  tables: ['todo', 'todoRelation', 'todoLog', 'actionEdge', 'pluse', 'repeatOccurrence', 'plan', 'timeSlot'],

});
