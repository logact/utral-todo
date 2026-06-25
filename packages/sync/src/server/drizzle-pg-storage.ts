import type { HLCTimestamp, SyncEvent } from '@utral/types';
import type { ServerSyncStorage, SyncableRecord } from '../core/types.js';
import type { PgTableWithColumns, PgColumn } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNotNull, gt, lt, sql } from 'drizzle-orm';
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

/** Map from canonical table names to Drizzle schema table keys */
const TABLE_TO_SCHEMA: Record<string, string> = {
  todo: 'todo',
  todoRelation: 'todoRelation',
  todoLog: 'todoLog',
  actionEdge: 'actionEdge',
  pluse: 'pluse',
  timerSession: 'timerSession',
  repeatOccurrence: 'repeatOccurrence',
  plan: 'plan',
};

function toNum(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : (v as number) ?? 0;
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

  private getTable(table: string): AnyPgTable | undefined {
    const key = TABLE_TO_SCHEMA[table] ?? table;
    return this.schema[key];
  }

  private getColumns(tbl: AnyPgTable): Record<string, PgColumn> {
    return (tbl as any)._;
  }

  async getRecord(table: string, id: string): Promise<SyncableRecord | undefined> {
    const tbl = this.getTable(table);
    if (!tbl) return undefined;
    const rows = await this.db.select().from(tbl).where(this.eqFn(tbl.id, id)).limit(1);
    if (rows.length === 0) return undefined;
    return this.rowToSyncable(rows[0] as Record<string, unknown>);
  }

  async createRecord(table: string, record: SyncableRecord): Promise<void> {
    const tbl = this.getTable(table);
    if (!tbl) return;
    await this.db.insert(tbl).values(this.sanitizeForInsert(record as Record<string, unknown>));
  }

  async updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void> {
    const tbl = this.getTable(table);
    if (!tbl) return;
    await this.db.update(tbl).set(this.sanitizeForInsert(changes as Record<string, unknown>)).where(this.eqFn(tbl.id, id));
  }

  async softDelete(table: string, id: string, deletedAt: HLCTimestamp): Promise<void> {
    const tbl = this.getTable(table);
    if (!tbl) return;
    await this.db.update(tbl).set({
      deletedAtWall: deletedAt.wall,
      deletedAtCounter: deletedAt.counter,
      deletedAtNode: deletedAt.node,
    }).where(this.eqFn(tbl.id, id));
  }

  async createSyncEvent(
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    payload: unknown,
    deviceId: string,
  ): Promise<SyncEvent> {
    const rows = await this.db.insert(this.syncEventTable).values({
      table,
      operation,
      recordId,
      payload: payload ? JSON.stringify(payload) : null,
      deviceId,
    }).returning();

    const event = rows[0] as Record<string, unknown>;
    return {
      ...event,
      operation: event.operation as SyncEvent['operation'],
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
      createdAt: { wall: (event.createdAt as Date).getTime(), counter: 0, node: deviceId },
    } as SyncEvent;
  }

  async getEventsSince(since: Date): Promise<SyncEvent[]> {
    const rows = await this.db.select().from(this.syncEventTable)
      .where(this.gtFn(this.syncEventTable.createdAt, since))
      .orderBy(this.syncEventTable.createdAt);

    return rows.map((e: Record<string, unknown>) => ({
      ...e,
      operation: e.operation as SyncEvent['operation'],
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      createdAt: {
        wall: (e.createdAt as Date).getTime(),
        counter: toNum(e.versionCounter),
        node: (e.versionNode as string) || 'server',
      },
    })) as SyncEvent[];
  }

  async garbageCollectTombstones(ttlMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMs);
    let totalDeleted = 0;

    for (const key of Object.values(TABLE_TO_SCHEMA)) {
      const tbl = this.schema[key];
      if (!tbl) continue;
      const result = await this.db.delete(tbl).where(
        this.andFn(
          this.isNotNullFn(tbl.deletedAtWall),
          this.ltFn(tbl.updatedAt, cutoff),
        ),
      );
      totalDeleted += (result.rowCount ?? 0);
    }

    if (totalDeleted > 0) {
      console.log(`[sync] GC: removed ${totalDeleted} tombstones older than ${ttlMs}ms`);
    }
    return totalDeleted;
  }

  private sanitizeForInsert(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val === null || val === undefined) continue;
      // Skip HLC timestamp objects — they should already be decomposed
      if (typeof val === 'object' && 'wall' in val && 'counter' in val && 'node' in val) {
        continue;
      }
      result[key] = val;
    }
    return result;
  }

  private rowToSyncable(row: Record<string, unknown>): SyncableRecord {
    return {
      id: row.id as string,
      updatedAt: {
        wall: toNum(row.versionWall),
        counter: toNum(row.versionCounter),
        node: (row.versionNode as string) || '',
      },
      deletedAt: row.deletedAtWall != null ? {
        wall: toNum(row.deletedAtWall),
        counter: toNum(row.deletedAtCounter),
        node: (row.deletedAtNode as string) || '',
      } : undefined,
      ...row,
    };
  }
}
