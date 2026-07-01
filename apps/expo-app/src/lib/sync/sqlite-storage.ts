import type {
  SyncableRecord,
  SyncQueueItem,
} from '@utral/sync-share';
import type { SQLiteBindValue } from 'expo-sqlite';
import type {
  SyncQueueStorage,
  SyncRecordStorage,
  SyncStateStorage,
} from '@utral/sync-client';
import type { SQLiteDatabase } from 'expo-sqlite';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';

// Entity-name → drizzle table. Domain records live in their real tables; there
// is no shadow `sync_records` table (mirrors desktop's TauriSqliteStorage).
const SYNC_TABLE_MAP: Record<string, any> = {
  todo:             schema.todos,
  todoRelation:     schema.todoRelations,
  todoLog:          schema.todoLogs,
  actionEdge:       schema.actionEdges,
  plan:             schema.plans,
  pluse:            schema.pluses,
  repeatOccurrence: schema.repeatOccurrences,
  timeSlot:         schema.timeSlots,
};

export class ExpoSqliteStorage implements SyncQueueStorage, SyncRecordStorage, SyncStateStorage {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  async init(): Promise<void> {
    // Schema is now owned by Drizzle migrations via useMigrations.
  }

  // ─── Record operations (real domain tables via Drizzle) ──────────

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

    await db.insert(t).values(values as any).onConflictDoUpdate({
      target: t.id,
      set: values as any,
    });
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
    await this.db.runAsync(
      `INSERT OR REPLACE INTO sync_queue (id, table_name, operation, record_id, payload, created_at, retry_count, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.table,
      item.operation,
      item.recordId,
      JSON.stringify(item.payload),
      item.createdAt.toISOString(),
      item.retryCount,
      item.lastError ?? null
    );
  }

  async getQueueItems(): Promise<SyncQueueItem[]> {
    const rows = await this.db.getAllAsync<{
      id: string;
      table_name: string;
      operation: string;
      record_id: string;
      payload: string;
      created_at: string;
      retry_count: number;
      last_error: string | null;
    }>('SELECT * FROM sync_queue ORDER BY created_at ASC');

    return rows.map((row) => ({
      id: row.id,
      table: row.table_name,
      operation: row.operation as SyncQueueItem['operation'],
      recordId: row.record_id,
      payload: JSON.parse(row.payload),
      createdAt: new Date(row.created_at),
      retryCount: row.retry_count,
      lastError: row.last_error ?? undefined,
    }));
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
  }

  async updateQueueItem(id: string, changes: Partial<SyncQueueItem>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (changes.retryCount !== undefined) {
      sets.push('retry_count = ?');
      values.push(changes.retryCount);
    }
    if (changes.lastError !== undefined) {
      sets.push('last_error = ?');
      values.push(changes.lastError);
    }

    if (sets.length === 0) return;

    values.push(id);
    await this.db.runAsync(
      `UPDATE sync_queue SET ${sets.join(', ')} WHERE id = ?`,
      ...(values as SQLiteBindValue[])
    );
  }

  // ─── State operations (sync_state table) ─────────────────────────

  async getDeviceId(): Promise<string | undefined> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = 'device_id'"
    );
    return row?.value;
  }

  async setDeviceId(id: string): Promise<void> {
    await this.db.runAsync(
      "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('device_id', ?)",
      id
    );
  }

  async getLastSyncAt(): Promise<Date | undefined> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = 'last_sync_at'"
    );
    return row?.value ? new Date(row.value) : undefined;
  }

  async setLastSyncAt(date: Date): Promise<void> {
    await this.db.runAsync(
      "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_sync_at', ?)",
      date.toISOString()
    );
  }
}
