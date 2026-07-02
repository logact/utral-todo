import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import type { ServerSyncStorage, SyncEvent, HLCTimestamp } from '@utral/sync-share';
import { eq, and, gt, gte, lte, or } from 'drizzle-orm';

export const syncEvents = sqliteTable(
  'sync_events',
  {
    id: text('id').primaryKey(),
    seq: integer('seq').notNull(),
    channel: text('channel').notNull().default('default'),
    tableName: text('tableName').notNull(),
    operation: text('operation').notNull(),
    recordId: text('recordId').notNull(),
    payload: text('payload'),
    deviceId: text('deviceId').notNull(),
    createdAtWall: integer('createdAtWall').notNull(),
    createdAtCounter: integer('createdAtCounter').notNull(),
    createdAtNode: text('createdAtNode').notNull(),
  },
  (t) => [
    index('idx_sync_events_created_at').on(t.createdAtWall),
    index('idx_sync_events_seq').on(t.seq),
    index('idx_sync_events_channel').on(t.channel),
  ],
);

export const deviceEventQueue = sqliteTable(
  'device_event_queue',
  {
    eventId: text('event_id').notNull(),
    deviceId: text('device_id').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
    ackedAt: integer('acked_at'),
  },
  (t) => [
    index('idx_device_event_queue_device_status').on(t.deviceId, t.status),
  ],
);

interface DrizzleSqliteSyncStorageOptions {
  db: Database.Database;
}

export class DrizzleSqliteSyncStorage implements ServerSyncStorage {
  private db: BetterSQLite3Database;

  constructor(opts: DrizzleSqliteSyncStorageOptions) {
    this.db = drizzle(opts.db);
  }

  async createSyncEvent(syncEvent: SyncEvent, channel: string = 'default'): Promise<SyncEvent> {
    await this.db.insert(syncEvents).values({
      id: syncEvent.id,
      seq: syncEvent.seq,
      channel,
      tableName: syncEvent.table,
      operation: syncEvent.operation,
      recordId: syncEvent.recordId,
      payload: syncEvent.payload != null ? JSON.stringify(syncEvent.payload) : null,
      deviceId: syncEvent.deviceId,
      createdAtWall: syncEvent.createdAt.wall,
      createdAtCounter: syncEvent.createdAt.counter,
      createdAtNode: syncEvent.createdAt.node,
    });

    return syncEvent;
  }

  async getEventsSince(since: Date, channel?: string): Promise<SyncEvent[]> {
    const conditions = [gt(syncEvents.createdAtWall, since.getTime())];
    if (channel) {
      conditions.push(eq(syncEvents.channel, channel));
    }
    
    const rows = await this.db.select().from(syncEvents)
      .where(and(...conditions))
      .orderBy(syncEvents.createdAtWall, syncEvents.createdAtCounter);

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      channel: row.channel,
      table: row.tableName,
      operation: row.operation as SyncEvent['operation'],
      recordId: row.recordId,
      payload: row.payload != null ? JSON.parse(row.payload) : undefined,
      deviceId: row.deviceId,
      createdAt: {
        wall: row.createdAtWall,
        counter: row.createdAtCounter,
        node: row.createdAtNode,
      },
    }));
  }

  async getEventsSinceHLC(since: HLCTimestamp, channel?: string): Promise<SyncEvent[]> {
    const conditions = [
      or(
        gt(syncEvents.createdAtWall, since.wall),
        and(
          eq(syncEvents.createdAtWall, since.wall),
          gt(syncEvents.createdAtCounter, since.counter)
        ),
        and(
          eq(syncEvents.createdAtWall, since.wall),
          eq(syncEvents.createdAtCounter, since.counter),
          gt(syncEvents.createdAtNode, since.node)
        )
      )
    ];
    
    if (channel) {
      conditions.push(eq(syncEvents.channel, channel));
    }
    
    const rows = await this.db.select().from(syncEvents)
      .where(and(...conditions))
      .orderBy(syncEvents.createdAtWall, syncEvents.createdAtCounter);

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      channel: row.channel,
      table: row.tableName,
      operation: row.operation as SyncEvent['operation'],
      recordId: row.recordId,
      payload: row.payload != null ? JSON.parse(row.payload) : undefined,
      deviceId: row.deviceId,
      createdAt: {
        wall: row.createdAtWall,
        counter: row.createdAtCounter,
        node: row.createdAtNode,
      },
    }));
  }

  async getEventsBySeq(from: number, to: number, channel?: string): Promise<SyncEvent[]> {
    const conditions = [gte(syncEvents.seq, from), lte(syncEvents.seq, to)];
    if (channel) {
      conditions.push(eq(syncEvents.channel, channel));
    }
    
    const rows = await this.db.select().from(syncEvents)
      .where(and(...conditions))
      .orderBy(syncEvents.seq);

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      channel: row.channel,
      table: row.tableName,
      operation: row.operation as SyncEvent['operation'],
      recordId: row.recordId,
      payload: row.payload != null ? JSON.parse(row.payload) : undefined,
      deviceId: row.deviceId,
      createdAt: {
        wall: row.createdAtWall,
        counter: row.createdAtCounter,
        node: row.createdAtNode,
      },
    }));
  }

  trackEventDelivery(eventId: string, deviceId: string, channel: string): void {
    this.db.insert(deviceEventQueue).values({
      eventId,
      deviceId,
      channel,
      createdAt: Date.now(),
    }).onConflictDoNothing().run();
  }

  ackEventDelivery(deviceId: string, eventIds: string[]): void {
    const ackedAt = Date.now();
    for (const eventId of eventIds) {
      this.db.update(deviceEventQueue)
        .set({ status: 'acked', ackedAt })
        .where(
          and(
            eq(deviceEventQueue.deviceId, deviceId),
            eq(deviceEventQueue.eventId, eventId),
            eq(deviceEventQueue.status, 'pending')
          )
        ).run();
    }
  }

  async getPendingEventsForDevice(deviceId: string): Promise<SyncEvent[]> {
    const rows = await this.db.select({
      id: syncEvents.id,
      seq: syncEvents.seq,
      channel: syncEvents.channel,
      tableName: syncEvents.tableName,
      operation: syncEvents.operation,
      recordId: syncEvents.recordId,
      payload: syncEvents.payload,
      deviceId: syncEvents.deviceId,
      createdAtWall: syncEvents.createdAtWall,
      createdAtCounter: syncEvents.createdAtCounter,
      createdAtNode: syncEvents.createdAtNode,
    })
    .from(deviceEventQueue)
    .innerJoin(syncEvents, eq(deviceEventQueue.eventId, syncEvents.id))
    .where(
      and(
        eq(deviceEventQueue.deviceId, deviceId),
        eq(deviceEventQueue.status, 'pending')
      )
    )
    .orderBy(syncEvents.seq);

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      channel: row.channel,
      table: row.tableName,
      operation: row.operation as SyncEvent['operation'],
      recordId: row.recordId,
      payload: row.payload != null ? JSON.parse(row.payload) : undefined,
      deviceId: row.deviceId,
      createdAt: {
        wall: row.createdAtWall,
        counter: row.createdAtCounter,
        node: row.createdAtNode,
      },
    }));
  }
}
