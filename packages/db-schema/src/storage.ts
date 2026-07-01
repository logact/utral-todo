import type {
  SyncQueueStorage,
  SyncRecordStorage,
  SyncStateStorage,
  SyncQueueItem,
  SyncableRecord,
} from '@utral/sync-client';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { eq } from 'drizzle-orm';
import {
  todos,
  todoRelations,
  todoLogs,
  actionEdges,
  plans,
  pluses,
  repeatOccurrences,
  timeSlots,
} from './schema.js';
import { syncQueue, syncState } from './infra.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared SQLite sync storage for Utral Todo clients (desktop + mobile).
//
// A single Drizzle-backed implementation of the three client storage interfaces
// (SyncQueueStorage / SyncRecordStorage / SyncStateStorage). Domain records live
// in their real tables — addressed by canonical name via SYNC_TABLE_MAP — with
// no shadow record table; the sync/queue/state plumbing uses the shared
// `sync_queue` / `sync_state` tables. The Drizzle `db` is injected so both the
// Tauri sqlite-proxy and the Expo expo-sqlite instances can share this code.
// ─────────────────────────────────────────────────────────────────────────────

// Entity-name → drizzle table. Mirrors the outbound TABLE_NAME_MAP.
const SYNC_TABLE_MAP: Record<string, any> = {
  todo:             todos,
  todoRelation:     todoRelations,
  todoLog:          todoLogs,
  actionEdge:       actionEdges,
  plan:             plans,
  pluse:            pluses,
  repeatOccurrence: repeatOccurrences,
  timeSlot:         timeSlots,
};

export type SqliteSyncStorage = SyncQueueStorage &
  SyncRecordStorage &
  SyncStateStorage & { init(): Promise<void> };

export function createSqliteSyncStorage(
  db: BaseSQLiteDatabase<any, any, any>,
): SqliteSyncStorage {
  return {
    async init(): Promise<void> {
      // Tables are owned by Drizzle migrations (initDatabase / useMigrations).
    },

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
    },

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

      // Upsert: updateRecord re-invokes addRecord on an existing row, so a plain
      // insert would violate the primary key.
      await db.insert(t).values(values as any).onConflictDoUpdate({
        target: t.id,
        set: values as any,
      });
    },

    async updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void> {
      const existing = await this.getRecord(table, id);
      if (!existing) {
        await this.addRecord(table, { ...changes, id } as SyncableRecord);
        return;
      }

      const merged: SyncableRecord = { ...existing, ...changes, id };
      await this.addRecord(table, merged);
    },

    async deleteRecord(table: string, id: string): Promise<void> {
      const t = SYNC_TABLE_MAP[table];
      if (!t) return;

      await db.delete(t).where(eq(t.id, id));
    },

    // ─── Queue operations (sync_queue table) ─────────────────────────

    async addToQueue(item: SyncQueueItem): Promise<void> {
      const i = item as Record<string, unknown>;
      await db.insert(syncQueue).values({
        id: item.id,
        tableName: i.table as string,
        operation: i.operation as string,
        recordId: i.recordId as string,
        payload: JSON.stringify(i.payload),
        createdAt: (i.createdAt as Date).toISOString(),
        retryCount: (i.retryCount as number) ?? 0,
        lastError: (i.lastError as string) ?? null,
      }).onConflictDoUpdate({
        target: syncQueue.id,
        set: {
          tableName: i.table as string,
          operation: i.operation as string,
          recordId: i.recordId as string,
          payload: JSON.stringify(i.payload),
          createdAt: (i.createdAt as Date).toISOString(),
          retryCount: (i.retryCount as number) ?? 0,
          lastError: (i.lastError as string) ?? null,
        },
      });
    },

    async getQueueItems(): Promise<SyncQueueItem[]> {
      const rows = await db.select().from(syncQueue);
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
    },

    async deleteQueueItem(id: string): Promise<void> {
      await db.delete(syncQueue).where(eq(syncQueue.id, id));
    },

    async updateQueueItem(id: string, changes: Partial<SyncQueueItem>): Promise<void> {
      const set: Record<string, unknown> = {};
      if (changes.retryCount !== undefined) set.retryCount = changes.retryCount;
      if (changes.lastError !== undefined) set.lastError = changes.lastError;
      if (Object.keys(set).length === 0) return;

      await db.update(syncQueue).set(set).where(eq(syncQueue.id, id));
    },

    // ─── State operations (sync_state table) ─────────────────────────

    async getDeviceId(): Promise<string | undefined> {
      const rows = await db.select().from(syncState).where(eq(syncState.key, 'device_id'));
      return rows[0]?.value ?? undefined;
    },

    async setDeviceId(id: string): Promise<void> {
      await db.insert(syncState).values({ key: 'device_id', value: id })
        .onConflictDoUpdate({ target: syncState.key, set: { value: id } });
    },

    async getLastSyncAt(): Promise<Date | undefined> {
      const rows = await db.select().from(syncState).where(eq(syncState.key, 'last_sync_at'));
      return rows[0]?.value ? new Date(rows[0].value) : undefined;
    },

    async setLastSyncAt(date: Date): Promise<void> {
      const value = date.toISOString();
      await db.insert(syncState).values({ key: 'last_sync_at', value })
        .onConflictDoUpdate({ target: syncState.key, set: { value } });
    },
  };
}
