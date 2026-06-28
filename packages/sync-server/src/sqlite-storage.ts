import type Database from 'better-sqlite3';
import type { ServerSyncStorage, SyncEvent, HLCTimestamp } from '@utral/sync-share';

export class SqliteSyncStorage implements ServerSyncStorage {
  private db: Database.Database;
  private insertStmt!: Database.Statement;
  private selectSinceStmt!: Database.Statement;
  private selectSinceHLCStmt!: Database.Statement;
  private selectBySeqStmt!: Database.Statement;
  private insertQueueStmt!: Database.Statement;
  private ackQueueStmt!: Database.Statement;
  private selectPendingForDeviceStmt!: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Create the sync_events table and prepare statements. Call once at startup. */
  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_events (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        tableName TEXT NOT NULL,
        operation TEXT NOT NULL,
        recordId TEXT NOT NULL,
        payload TEXT,
        deviceId TEXT NOT NULL,
        createdAtWall INTEGER NOT NULL,
        createdAtCounter INTEGER NOT NULL,
        createdAtNode TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_events_created_at
        ON sync_events (createdAtWall);
      CREATE INDEX IF NOT EXISTS idx_sync_events_seq
        ON sync_events (seq);

      CREATE TABLE IF NOT EXISTS device_event_queue (
        event_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        acked_at INTEGER,
        UNIQUE(event_id, device_id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_event_queue_device_status
        ON device_event_queue (device_id, status);
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO sync_events (id, seq, tableName, operation, recordId, payload, deviceId, createdAtWall, createdAtCounter, createdAtNode)
      VALUES (@id, @seq, @tableName, @operation, @recordId, @payload, @deviceId, @createdAtWall, @createdAtCounter, @createdAtNode)
    `);

    this.selectSinceStmt = this.db.prepare(`
      SELECT id, seq, tableName, operation, recordId, payload, deviceId, createdAtWall, createdAtCounter, createdAtNode
      FROM sync_events
      WHERE createdAtWall > @sinceWall
      ORDER BY createdAtWall ASC, createdAtCounter ASC
    `);

    this.selectSinceHLCStmt = this.db.prepare(`
      SELECT id, seq, tableName, operation, recordId, payload, deviceId, createdAtWall, createdAtCounter, createdAtNode
      FROM sync_events
      WHERE createdAtWall > @sinceWall
         OR (createdAtWall = @sinceWall AND createdAtCounter > @sinceCounter)
         OR (createdAtWall = @sinceWall AND createdAtCounter = @sinceCounter AND createdAtNode > @sinceNode)
      ORDER BY createdAtWall ASC, createdAtCounter ASC
    `);

    this.selectBySeqStmt = this.db.prepare(`
      SELECT id, seq, tableName, operation, recordId, payload, deviceId, createdAtWall, createdAtCounter, createdAtNode
      FROM sync_events
      WHERE seq >= @from AND seq <= @to
      ORDER BY seq ASC
    `);

    this.insertQueueStmt = this.db.prepare(`
      INSERT OR IGNORE INTO device_event_queue (event_id, device_id, channel, status, created_at)
      VALUES (@eventId, @deviceId, @channel, 'pending', @createdAt)
    `);

    this.ackQueueStmt = this.db.prepare(`
      UPDATE device_event_queue
      SET status = 'acked', acked_at = @ackedAt
      WHERE device_id = @deviceId AND event_id = @eventId AND status = 'pending'
    `);

    this.selectPendingForDeviceStmt = this.db.prepare(`
      SELECT e.id, e.seq, e.tableName, e.operation, e.recordId, e.payload, e.deviceId,
             e.createdAtWall, e.createdAtCounter, e.createdAtNode
      FROM device_event_queue dq
      JOIN sync_events e ON e.id = dq.event_id
      WHERE dq.device_id = @deviceId AND dq.status = 'pending'
      ORDER BY e.seq ASC
    `);
  }

  async createSyncEvent(syncEvent: SyncEvent): Promise<SyncEvent> {
    this.insertStmt.run({
      id: syncEvent.id,
      seq: syncEvent.seq,
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

  async getEventsSince(since: Date): Promise<SyncEvent[]> {
    const rows = this.selectSinceStmt.all({ sinceWall: since.getTime() }) as Array<{
      id: string;
      seq: number;
      tableName: string;
      operation: 'create' | 'update' | 'delete';
      recordId: string;
      payload: string | null;
      deviceId: string;
      createdAtWall: number;
      createdAtCounter: number;
      createdAtNode: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      table: row.tableName,
      operation: row.operation,
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

  async getEventsSinceHLC(since: HLCTimestamp): Promise<SyncEvent[]> {
    const rows = this.selectSinceHLCStmt.all({
      sinceWall: since.wall,
      sinceCounter: since.counter,
      sinceNode: since.node,
    }) as Array<{
      id: string;
      seq: number;
      tableName: string;
      operation: 'create' | 'update' | 'delete';
      recordId: string;
      payload: string | null;
      deviceId: string;
      createdAtWall: number;
      createdAtCounter: number;
      createdAtNode: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      table: row.tableName,
      operation: row.operation,
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

  async getEventsBySeq(from: number, to: number): Promise<SyncEvent[]> {
    const rows = this.selectBySeqStmt.all({ from, to }) as Array<{
      id: string;
      seq: number;
      tableName: string;
      operation: 'create' | 'update' | 'delete';
      recordId: string;
      payload: string | null;
      deviceId: string;
      createdAtWall: number;
      createdAtCounter: number;
      createdAtNode: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      table: row.tableName,
      operation: row.operation,
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
    this.insertQueueStmt.run({
      eventId,
      deviceId,
      channel,
      createdAt: Date.now(),
    });
  }

  ackEventDelivery(deviceId: string, eventIds: string[]): void {
    const ackedAt = Date.now();
    for (const eventId of eventIds) {
      this.ackQueueStmt.run({ deviceId, eventId, ackedAt });
    }
  }

  async getPendingEventsForDevice(deviceId: string): Promise<SyncEvent[]> {
    const rows = this.selectPendingForDeviceStmt.all({ deviceId }) as Array<{
      id: string;
      seq: number;
      tableName: string;
      operation: 'create' | 'update' | 'delete';
      recordId: string;
      payload: string | null;
      deviceId: string;
      createdAtWall: number;
      createdAtCounter: number;
      createdAtNode: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      table: row.tableName,
      operation: row.operation,
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
