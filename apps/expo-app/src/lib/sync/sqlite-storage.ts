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

export class ExpoSqliteStorage implements SyncQueueStorage, SyncRecordStorage, SyncStateStorage {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  async init(): Promise<void> {
    // Schema is now owned by Drizzle migrations via useMigrations.
  }

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

  async getRecord(table: string, id: string): Promise<SyncableRecord | undefined> {
    const row = await this.db.getFirstAsync<{
      record: string;
      deleted_at_wall: number | null;
      deleted_at_counter: number | null;
      deleted_at_node: string | null;
    }>(
      'SELECT record, deleted_at_wall, deleted_at_counter, deleted_at_node FROM sync_records WHERE id = ? AND table_name = ?',
      id,
      table
    );

    if (!row) return undefined;

    const record = JSON.parse(row.record) as SyncableRecord;
    if (row.deleted_at_wall !== null) {
      record.deletedAt = {
        wall: row.deleted_at_wall,
        counter: row.deleted_at_counter!,
        node: row.deleted_at_node!,
      };
    }
    return record;
  }

  async addRecord(table: string, record: SyncableRecord): Promise<void> {
    const { updatedAt, deletedAt, ...data } = record;
    await this.db.runAsync(
      `INSERT OR REPLACE INTO sync_records (id, table_name, record, updated_at_wall, updated_at_counter, updated_at_node, deleted_at_wall, deleted_at_counter, deleted_at_node)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id,
      table,
      JSON.stringify(data),
      updatedAt.wall,
      updatedAt.counter,
      updatedAt.node,
      deletedAt?.wall ?? null,
      deletedAt?.counter ?? null,
      deletedAt?.node ?? null
    );
  }

  async updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void> {
    const existing = await this.getRecord(table, id);
    if (!existing) return;

    const merged = { ...existing, ...changes };
    await this.addRecord(table, merged);
  }

  async deleteRecord(table: string, id: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM sync_records WHERE id = ? AND table_name = ?',
      id,
      table
    );
  }

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
