import type { SyncEvent } from '@utral/types';
import type { ServerSyncStorage, ApplyResult, SyncableRecord } from '../core/types.js';
import { shouldAdoptRemote, hlcFromParts } from '../core/crdt.js';

export interface SyncHandlerOptions {
  storage: ServerSyncStorage;
  tables: string[];
  tombstoneTtlMs?: number;
  /** Called after a change is applied — for SSE broadcast and APNS push */
  onBroadcast?: (event: SyncEvent, excludeDeviceId?: string) => void;
}

interface SSEConnection {
  write(data: string): void;
  onClose(cb: () => void): void;
}

interface PushResult {
  accepted: number;
  rejected: Array<{ recordId: string; reason: string }>;
}

export class SyncHandler {
  private storage: ServerSyncStorage;
  private tables: string[];
  private tombstoneTtlMs: number;
  private onBroadcast?: (event: SyncEvent, excludeDeviceId?: string) => void;
  private connections = new Map<string, { conn: SSEConnection; keepAlive: ReturnType<typeof setInterval> }[]>();

  constructor(opts: SyncHandlerOptions) {
    this.storage = opts.storage;
    this.tables = opts.tables;
    this.tombstoneTtlMs = opts.tombstoneTtlMs ?? 30 * 24 * 60 * 60 * 1000;
    this.onBroadcast = opts.onBroadcast;
  }

  /** Process a batch of client changes, resolve conflicts, persist, broadcast */
  async acceptPush(deviceId: string, changes: SyncEvent[]): Promise<PushResult> {
    let accepted = 0;
    const rejected: Array<{ recordId: string; reason: string }> = [];

    for (const event of changes) {
      try {
        const result = await this.applyChange(event, deviceId);
        if (result === 'applied' || result === 'deleted') {
          accepted++;
        } else if (result === 'skipped') {
          // Conflict resolved — remote lost, not an error
        }
      } catch (err) {
        rejected.push({
          recordId: event.recordId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { accepted, rejected };
  }

  /** Apply a single change with CRDT conflict resolution */
  private async applyChange(event: SyncEvent, deviceId: string): Promise<ApplyResult> {
    const { table, operation, recordId, payload } = event;
    const data = payload as Record<string, unknown> | undefined;

    if (!this.tables.includes(table)) {
      console.warn(`[sync] Unknown table: ${table}`);
      return 'skipped';
    }

    if (operation === 'delete') {
      return this.applyDelete(table, recordId, data, deviceId);
    }

    if (!data) return 'skipped';
    return this.applyCreateOrUpdate(table, recordId, data, deviceId, event);
  }

  private async applyDelete(
    table: string,
    recordId: string,
    data: Record<string, unknown> | undefined,
    deviceId: string
  ): Promise<ApplyResult> {
    const local = await this.storage.getRecord(table, recordId);

    if (!local) return 'skipped';

    if (data?.deletedAtWall != null) {
      const remoteHLC = hlcFromParts(
        Number(data.deletedAtWall) || 0,
        Number(data.deletedAtCounter) || 0,
        (data.deletedAtNode as string) || deviceId,
      );
      const decision = shouldAdoptRemote(
        { id: recordId, updatedAt: local.updatedAt },
        { id: recordId, updatedAt: local.updatedAt, deletedAt: remoteHLC },
      );
      if (decision === 'delete') {
        await this.storage.softDelete(table, recordId, remoteHLC);
        return 'deleted';
      }
      return 'skipped';
    }

    // Legacy hard delete
    await this.storage.softDelete(table, recordId, local.updatedAt);
    return 'deleted';
  }

  private async applyCreateOrUpdate(
    table: string,
    recordId: string,
    data: Record<string, unknown>,
    deviceId: string,
    event: SyncEvent
  ): Promise<ApplyResult> {
    const local = await this.storage.getRecord(table, recordId);

    if (local) {
      const remoteHLC = hlcFromParts(
        Number(data.versionWall) || 0,
        Number(data.versionCounter) || 0,
        (data.versionNode as string) || deviceId,
      );
      const decision = shouldAdoptRemote(
        { id: recordId, updatedAt: local.updatedAt },
        { id: recordId, updatedAt: remoteHLC },
      );
      if (decision !== 'adopt') return 'skipped';
      await this.storage.updateRecord(table, recordId, data as SyncableRecord);
    } else {
      await this.storage.createRecord(table, data as SyncableRecord);
    }

    // Log and broadcast
    const syncEvent = await this.storage.createSyncEvent(
      table,
      event.operation as 'create' | 'update',
      recordId,
      data,
      deviceId,
    );

    this.broadcast(syncEvent, deviceId);

    return 'applied';
  }

  /** Subscribe an SSE connection for real-time updates */
  subscribe(deviceId: string, conn: SSEConnection): void {
    const keepAlive = setInterval(() => {
      try { conn.write(':ping\n\n'); } catch { /* client disconnected */ }
    }, 30_000);

    const entry = { conn, keepAlive };
    const existing = this.connections.get(deviceId) ?? [];
    existing.push(entry);
    this.connections.set(deviceId, existing);

    conn.onClose(() => {
      clearInterval(keepAlive);
      const conns = this.connections.get(deviceId);
      if (conns) {
        const idx = conns.indexOf(entry);
        if (idx >= 0) conns.splice(idx, 1);
        if (conns.length === 0) this.connections.delete(deviceId);
      }
    });
  }

  /** Send an event to all connected SSE clients except the originator */
  broadcast(event: SyncEvent, excludeDeviceId?: string): void {
    const data = `data: ${JSON.stringify({ type: 'event', event }, (_k, v) => typeof v === 'bigint' ? Number(v) : v)}\n\n`;

    for (const [deviceId, conns] of this.connections) {
      if (excludeDeviceId && deviceId === excludeDeviceId) continue;
      for (const { conn } of conns) {
        try { conn.write(data); } catch { /* client disconnected */ }
      }
    }

    this.onBroadcast?.(event, excludeDeviceId);
  }

  /** Send initial delta to a newly connected SSE client */
  async sendInitialDelta(deviceId: string, conn: SSEConnection, since?: Date): Promise<void> {
    if (!since) return;
    const events = await this.storage.getEventsSince(since);
    if (events.length === 0) return;
    const data = JSON.stringify({ type: 'delta', events });
    try { conn.write(`data: ${data}\n\n`); } catch { /* client disconnected */ }
  }

  /** Get events since a timestamp — for HTTP polling fallback */
  async getEventsSince(since: Date): Promise<SyncEvent[]> {
    return this.storage.getEventsSince(since);
  }

  /** Garbage-collect old tombstones */
  async garbageCollectTombstones(): Promise<number> {
    return this.storage.garbageCollectTombstones(this.tombstoneTtlMs);
  }

  /** Create a sync event log entry — used by server routes after REST mutations */
  async createSyncEvent(
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    payload: unknown,
    deviceId: string
  ): Promise<SyncEvent> {
    return this.storage.createSyncEvent(table, operation, recordId, payload, deviceId);
  }
}
