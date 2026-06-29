import type {
  SyncableRecord,
} from '@utral/sync-share';
import type {
  SyncQueueStorage,
  SyncRecordStorage,
  SyncStateStorage,
  SyncQueueItem,
} from '@utral/sync-client';
import { db } from '../../db/drizzle-adapter';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SYNC_TABLE_MAP: Record<string, any> = {
  todo:             schema.todos,
  todoRelation:     schema.todoRelations,
  todoLog:          schema.todoLogs,
  actionEdge:       schema.actionEdges,
  plan:             schema.plans,
  pluse:            schema.pluses,
  repeatOccurrence: schema.repeatOccurrences,
};

export class TauriSqliteStorage implements SyncQueueStorage, SyncRecordStorage, SyncStateStorage {

  async init(): Promise<void> {
    // Tables are created by initDatabase() in drizzle-adapter.ts
  }

  // ─── Record operations (real tables via Drizzle) ─────────────────

  async getRecord(table: string, id: string): Promise<SyncableRecord | undefined> {
    const t = SYNC_TABLE_MAP[table];
    if (!t) return undefined;

    const rows = await db.select().from(t).where(eq(t.id, id));
    if (!rows[0]) return undefined;

    const row = rows[0] as Record<string, unknown>;
    const record: SyncableRecord = {
      id: row.id as string,
      isDeleted: (row.isDeleted as boolean) ?? false,
      version: {
        wall: (row.updatedAtWall as number) ?? 0,
        counter: (row.updatedAtCounter as number) ?? 0,
        node: (row.updatedAtNode as string) ?? '',
      },
    };
    for (const [key, value] of Object.entries(row)) {
      if (key !== 'id' && !(key in record)) {
        (record as Record<string, unknown>)[key] = value;
      }
    }
    return record;
  }

  async addRecord(table: string, record: SyncableRecord): Promise<void> {
    const t = SYNC_TABLE_MAP[table];
    if (!t) return;

    const r = record as Record<string, unknown>;
    const version = r.version as { wall?: number; counter?: number; node?: string } | undefined;
    const createdAt = r.createdAt as { wall?: number; counter?: number; node?: string } | undefined;

    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(r)) {
      if (key === 'version' || key === 'createdAt' || key === 'updatedAt') continue;
      values[key] = value;
    }
    values.createdAtWall = createdAt?.wall ?? version?.wall ?? null;
    values.createdAtCounter = createdAt?.counter ?? version?.counter ?? 0;
    values.createdAtNode = createdAt?.node ?? version?.node ?? null;
    values.updatedAtWall = version?.wall ?? null;
    values.updatedAtCounter = version?.counter ?? 0;
    values.updatedAtNode = version?.node ?? null;
    values.isDeleted = (r.isDeleted as boolean) ?? false;

    await db.insert(t).values(values as any);
  }

  async updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void> {
    const existing = await this.getRecord(table, id);
    if (!existing) {
      await this.addRecord(table, { ...changes, id } as SyncableRecord);
      return;
    }

    const merged: SyncableRecord = { ...existing, ...changes, id };
    await this.addRecord(table, merged);
  }

  async deleteRecord(table: string, id: string): Promise<void> {
    const t = SYNC_TABLE_MAP[table];
    if (!t) return;

    await db.delete(t).where(eq(t.id, id));
  }

  // ─── Queue operations (sync_queue table) ─────────────────────────

  async addToQueue(item: SyncQueueItem): Promise<void> {
    const i = item as Record<string, unknown>;
    await db.insert(schema.syncQueue).values({
      id: item.id,
      tableName: i.table as string,
      operation: i.operation as string,
      recordId: i.recordId as string,
      payload: JSON.stringify(i.payload),
      createdAt: (i.createdAt as Date).toISOString(),
      retryCount: (i.retryCount as number) ?? 0,
      lastError: (i.lastError as string) ?? null,
    });
  }

  async getQueueItems(): Promise<SyncQueueItem[]> {
    const rows = await db.select().from(schema.syncQueue);
    return rows.map((row) => ({
      id: row.id,
      table: row.tableName,
      operation: row.operation,
      recordId: row.recordId,
      payload: JSON.parse(row.payload ?? '{}'),
      createdAt: new Date(row.createdAt),
      retryCount: row.retryCount ?? 0,
      lastError: row.lastError ?? undefined,
    } as SyncQueueItem));
  }

  async deleteQueueItem(id: string): Promise<void> {
    await db.delete(schema.syncQueue).where(eq(schema.syncQueue.id, id));
  }

  async updateQueueItem(id: string, changes: Partial<SyncQueueItem>): Promise<void> {
    const set: Record<string, unknown> = {};
    if (changes.retryCount !== undefined) set.retryCount = changes.retryCount;
    if (changes.lastError !== undefined) set.lastError = changes.lastError;
    if (Object.keys(set).length === 0) return;

    await db.update(schema.syncQueue).set(set).where(eq(schema.syncQueue.id, id));
  }

  // ─── State operations (sync_state table) ─────────────────────────

  async getDeviceId(): Promise<string | undefined> {
    const rows = await db.select().from(schema.syncState).where(eq(schema.syncState.key, 'device_id'));
    return rows[0]?.value ?? undefined;
  }

  async setDeviceId(id: string): Promise<void> {
    await db.insert(schema.syncState).values({ key: 'device_id', value: id })
      .onConflictDoUpdate({ target: schema.syncState.key, set: { value: id } });
  }

  async getLastSyncAt(): Promise<Date | undefined> {
    const rows = await db.select().from(schema.syncState).where(eq(schema.syncState.key, 'last_sync_at'));
    return rows[0]?.value ? new Date(rows[0].value) : undefined;
  }

  async setLastSyncAt(date: Date): Promise<void> {
    const value = date.toISOString();
    await db.insert(schema.syncState).values({ key: 'last_sync_at', value })
      .onConflictDoUpdate({ target: schema.syncState.key, set: { value } });
  }
}
