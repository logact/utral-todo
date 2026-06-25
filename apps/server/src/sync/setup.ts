import { DrizzlePgSyncStorage } from '@utral/sync/server';
import { SyncHandler } from '@utral/sync/server';
import { db, schema } from '../db/index.js';
import { broadcastToDevices } from '../apns/broadcast.js';
import type { SyncEvent } from '@utral/types';
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
  tables: ['todo', 'todoRelation', 'todoLog', 'actionEdge', 'pluse', 'timerSession', 'repeatOccurrence', 'plan'],
  onBroadcast: (event: SyncEvent, excludeDeviceId?: string) => {
    broadcastToDevices(
      { table: event.table, operation: event.operation, recordId: event.recordId },
      excludeDeviceId
    ).catch(() => {});
  },
});
