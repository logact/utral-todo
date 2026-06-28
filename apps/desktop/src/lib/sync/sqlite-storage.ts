import type {
  SyncableRecord,
  SyncQueueItem,
} from '@utral/sync-share';
import type {
  SyncQueueStorage,
  SyncRecordStorage,
  SyncStateStorage,
} from '@utral/sync-client';
import Database from '@tauri-apps/plugin-sql';

export class TauriSqliteStorage implements SyncQueueStorage, SyncRecordStorage, SyncStateStorage {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async init(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_records (
        id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record TEXT NOT NULL,
        updated_at_wall INTEGER NOT NULL,
        updated_at_counter INTEGER NOT NULL,
        updated_at_node TEXT NOT NULL,
        deleted_at_wall INTEGER,
        deleted_at_counter INTEGER,
        deleted_at_node TEXT,
        PRIMARY KEY (id, table_name)
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  async addToQueue(item: SyncQueueItem): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO sync_queue (id, table_name, operation, record_id, payload, created_at, retry_count, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        item.id,
        item.table,
        item.operation,
        item.recordId,
        JSON.stringify(item.payload),
        item.createdAt.toISOString(),
        item.retryCount,
        item.lastError ?? null,
      ]
    );
  }

  async getQueueItems(): Promise<SyncQueueItem[]> {
    const rows = await this.db.select<Record<string, unknown>[]>('SELECT * FROM sync_queue ORDER BY created_at ASC');

    return rows.map((row) => ({
      id: row.id as string,
      table: row.table_name as string,
      operation: row.operation as SyncQueueItem['operation'],
      recordId: row.record_id as string,
      payload: JSON.parse(row.payload as string),
      createdAt: new Date(row.created_at as string),
      retryCount: row.retry_count as number,
      lastError: (row.last_error as string) ?? undefined,
    }));
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.db.execute('DELETE FROM sync_queue WHERE id = $1', [id]);
  }

  async updateQueueItem(id: string, changes: Partial<SyncQueueItem>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (changes.retryCount !== undefined) {
      sets.push(`retry_count = $${paramIndex++}`);
      values.push(changes.retryCount);
    }
    if (changes.lastError !== undefined) {
      sets.push(`last_error = $${paramIndex++}`);
      values.push(changes.lastError);
    }

    if (sets.length === 0) return;

    values.push(id);
    await this.db.execute(
      `UPDATE sync_queue SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async getRecord(table: string, id: string): Promise<SyncableRecord | undefined> {
    const rows = await this.db.select<{
      record: string;
      deleted_at_wall: number | null;
      deleted_at_counter: number | null;
      deleted_at_node: string | null;
    }[]>(
      'SELECT record, deleted_at_wall, deleted_at_counter, deleted_at_node FROM sync_records WHERE id = $1 AND table_name = $2',
      [id, table]
    );

    if (rows.length === 0) return undefined;

    const row = rows[0];
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
    await this.db.execute(
      `INSERT OR REPLACE INTO sync_records (id, table_name, record, updated_at_wall, updated_at_counter, updated_at_node, deleted_at_wall, deleted_at_counter, deleted_at_node)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        table,
        JSON.stringify(data),
        updatedAt.wall,
        updatedAt.counter,
        updatedAt.node,
        deletedAt?.wall ?? null,
        deletedAt?.counter ?? null,
        deletedAt?.node ?? null,
      ]
    );
  }

  async updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void> {
    const existing = await this.getRecord(table, id);
    if (!existing) return;

    const merged = { ...existing, ...changes };
    await this.addRecord(table, merged);
  }

  async deleteRecord(table: string, id: string): Promise<void> {
    await this.db.execute(
      'DELETE FROM sync_records WHERE id = $1 AND table_name = $2',
      [id, table]
    );
  }

  async getDeviceId(): Promise<string | undefined> {
    const rows = await this.db.select<{ value: string }[]>(
      "SELECT value FROM sync_state WHERE key = 'device_id'"
    );
    return rows[0]?.value;
  }

  async setDeviceId(id: string): Promise<void> {
    await this.db.execute(
      "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('device_id', $1)",
      [id]
    );
  }

  async getLastSyncAt(): Promise<Date | undefined> {
    const rows = await this.db.select<{ value: string }[]>(
      "SELECT value FROM sync_state WHERE key = 'last_sync_at'"
    );
    return rows[0]?.value ? new Date(rows[0].value) : undefined;
  }

  async setLastSyncAt(date: Date): Promise<void> {
    await this.db.execute(
      "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_sync_at', $1)",
      [date.toISOString()]
    );
  }
}
