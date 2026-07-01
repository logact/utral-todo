import type { ServerSyncStorage, SyncEvent, HLCTimestamp } from '@utral/sync-share';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, isNotNull, gt, lt } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

type AnyPgTable = PgTableWithColumns<any>;

interface DrizzlePgSyncStorageOptions {
  db: NodePgDatabase<any>;
  schema: Record<string, AnyPgTable>;
  syncEventTable: AnyPgTable;
  eq: typeof eq;
  and: (...conditions: (SQL | undefined)[]) => SQL | undefined;
  isNotNull: typeof isNotNull;
  gt: typeof gt;
  lt: typeof lt;
}

export class DrizzlePgSyncStorage implements ServerSyncStorage {
  private db: NodePgDatabase<any>;
  private schema: Record<string, AnyPgTable>;
  private syncEventTable: AnyPgTable;
  private eqFn: typeof eq;
  private andFn: (...conditions: (SQL | undefined)[]) => SQL | undefined;
  private isNotNullFn: typeof isNotNull;
  private gtFn: typeof gt;
  private ltFn: typeof lt;

  constructor(opts: DrizzlePgSyncStorageOptions) {
    this.db = opts.db;
    this.schema = opts.schema;
    this.syncEventTable = opts.syncEventTable;
    this.eqFn = opts.eq;
    this.andFn = opts.and;
    this.isNotNullFn = opts.isNotNull;
    this.gtFn = opts.gt;
    this.ltFn = opts.lt;
  }

  async createSyncEvent(syncEvent: SyncEvent): Promise<SyncEvent> {
    const rows = await this.db.insert(this.syncEventTable).values({
      table: syncEvent.table,
      operation: syncEvent.operation,
      recordId: syncEvent.recordId,
      payload: syncEvent.payload ? JSON.stringify(syncEvent.payload) : null,
      deviceId: syncEvent.deviceId,
      seq: syncEvent.seq,
    }).returning();

    const event = rows[0] as Record<string, unknown>;
    return {
      id: event.id as string,
      seq: syncEvent.seq,
      table: syncEvent.table,
      operation: syncEvent.operation,
      recordId: syncEvent.recordId,
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
      deviceId: syncEvent.deviceId,
      createdAt: syncEvent.createdAt,
    };
  }

  async getEventsSince(since: Date): Promise<SyncEvent[]> {
    const rows = await this.db.select().from(this.syncEventTable)
      .where(this.gtFn(this.syncEventTable.createdAt, since))
      .orderBy(this.syncEventTable.createdAt);

    return rows.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      seq: e.seq as number,
      table: e.tableName as string,
      operation: e.operation as SyncEvent['operation'],
      recordId: e.recordId as string,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      deviceId: e.deviceId as string,
      createdAt: {
        wall: (e.createdAt as Date).getTime(),
        counter: 0,
        node: (e.deviceId as string) || 'server',
      },
    }));
  }

  async getEventsSinceHLC(since: HLCTimestamp): Promise<SyncEvent[]> {
    const rows = await this.db.select().from(this.syncEventTable)
      .where(this.gtFn(this.syncEventTable.createdAt, new Date(since.wall)))
      .orderBy(this.syncEventTable.createdAt);

    return rows.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      seq: e.seq as number,
      table: e.tableName as string,
      operation: e.operation as SyncEvent['operation'],
      recordId: e.recordId as string,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      deviceId: e.deviceId as string,
      createdAt: {
        wall: (e.createdAt as Date).getTime(),
        counter: 0,
        node: (e.deviceId as string) || 'server',
      },
    }));
  }

  async getEventsBySeq(from: number, to: number): Promise<SyncEvent[]> {
    const rows = await this.db.select().from(this.syncEventTable)
      .where(this.andFn(
        this.gtFn(this.syncEventTable.seq, from - 1),
        this.ltFn(this.syncEventTable.seq, to + 1)
      ))
      .orderBy(this.syncEventTable.seq);

    return rows.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      seq: e.seq as number,
      table: e.tableName as string,
      operation: e.operation as SyncEvent['operation'],
      recordId: e.recordId as string,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      deviceId: e.deviceId as string,
      createdAt: {
        wall: (e.createdAt as Date).getTime(),
        counter: 0,
        node: (e.deviceId as string) || 'server',
      },
    }));
  }

  trackEventDelivery(eventId: string, deviceId: string, _channel: string): void {
    // For PostgreSQL, we can use a simple insert with conflict handling
    this.db.insert(this.syncEventTable)
      .values({
        id: eventId,
        deviceId,
      } as any)
      .onConflictDoNothing()
      .catch(() => {});
  }

  ackEventDelivery(_deviceId: string, _eventIds: string[]): void {
    // For PostgreSQL, we can track this in a separate table or skip for now
    // This is a no-op for the basic implementation
  }

  async getPendingEventsForDevice(_deviceId: string): Promise<SyncEvent[]> {
    // For PostgreSQL, we can query events that haven't been acknowledged
    // For now, return empty array as this is not critical for basic sync
    return [];
  }
}
