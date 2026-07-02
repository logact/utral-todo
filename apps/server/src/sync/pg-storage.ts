import type { ServerSyncStorage, SyncEvent, HLCTimestamp } from '@utral/sync-share';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, isNotNull, gt, lt, sql } from 'drizzle-orm';
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
    // Persist under the client's raw queue-item id (so the push-ack echoes an
    // id the client recognizes) and assign seq from the DB (MAX+1 within the
    // event's channel) rather than an in-memory counter, so seq survives
    // restarts and is monotonic per channel. The MAX+1 is an inline subquery
    // evaluated against the table at insert time; adequate for this
    // single-server, low-concurrency deployment. Preserve the writer's HLC in
    // the version* columns so LWW ordering reflects writer logical time.
    const table = this.syncEventTable;
    const channel = syncEvent.channel ?? '';
    const rows = await this.db.insert(table).values({
      id: syncEvent.id,
      table: syncEvent.table,
      operation: syncEvent.operation,
      recordId: syncEvent.recordId,
      payload: syncEvent.payload ? JSON.stringify(syncEvent.payload) : null,
      deviceId: syncEvent.deviceId,
      channel,
      seq: sql`(SELECT COALESCE(MAX(${table.seq}), 0) + 1 FROM ${table} WHERE ${table.channel} = ${channel})`,
      versionWall: syncEvent.createdAt.wall,
      versionCounter: syncEvent.createdAt.counter,
      versionNode: syncEvent.createdAt.node,
    } as any).onConflictDoNothing({ target: table.id }).returning();

    // A conflict on `id` means this event was already persisted (e.g. a client
    // retried a push after a dropped ack). Treat it as idempotent: return the
    // existing row so the push-ack still echoes an id the client recognizes.
    const event = (rows[0] ??
      (await this.db.select().from(table).where(this.eqFn(table.id, syncEvent.id)))[0]) as Record<string, unknown>;
    return {
      id: event.id as string,
      seq: event.seq as number,
      channel,
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
      table: e.table as string,
      operation: e.operation as SyncEvent['operation'],
      recordId: e.recordId as string,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      deviceId: e.deviceId as string,
      createdAt: {
        wall: (e.versionWall as number) ?? 0,
        counter: (e.versionCounter as number) ?? 0,
        node: (e.versionNode as string) || (e.deviceId as string) || 'server',
      },
      channel: e.channel as string,
    }));
  }

  async getEventsSinceHLC(since: HLCTimestamp): Promise<SyncEvent[]> {
    const rows = await this.db.select().from(this.syncEventTable)
      .where(this.gtFn(this.syncEventTable.createdAt, new Date(since.wall)))
      .orderBy(this.syncEventTable.createdAt);

    return rows.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      seq: e.seq as number,
      table: e.table as string,
      operation: e.operation as SyncEvent['operation'],
      recordId: e.recordId as string,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      deviceId: e.deviceId as string,
      createdAt: {
        wall: (e.versionWall as number) ?? 0,
        counter: (e.versionCounter as number) ?? 0,
        node: (e.versionNode as string) || (e.deviceId as string) || 'server',
      },
      channel: e.channel as string,
    }));
  }

  async getEventsBySeq(from: number, to: number, channel: string): Promise<SyncEvent[]> {
    const rows = await this.db.select().from(this.syncEventTable)
      .where(this.andFn(
        this.eqFn(this.syncEventTable.channel, channel),
        this.gtFn(this.syncEventTable.seq, from - 1),
        this.ltFn(this.syncEventTable.seq, to + 1)
      ))
      .orderBy(this.syncEventTable.seq);

    return rows.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      seq: e.seq as number,
      channel: e.channel as string,
      table: e.table as string,
      operation: e.operation as SyncEvent['operation'],
      recordId: e.recordId as string,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      deviceId: e.deviceId as string,
      createdAt: {
        wall: (e.versionWall as number) ?? 0,
        counter: (e.versionCounter as number) ?? 0,
        node: (e.versionNode as string) || (e.deviceId as string) || 'server',
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
