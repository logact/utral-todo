import type { SyncHandlerOptions, ServerSocket, PushResult, PushMessage, SyncMessage } from './types.js';
import type { HLCTimestamp, SyncEvent } from '@utral/sync-share';
import { newHLC, SYNC_TABLE_SET } from '@utral/sync-share';
import { randomUUID } from 'node:crypto';

/**
 * Pull the writer's originating HLC out of a pushed record payload.
 * The record's `version` is the writer's logical clock (client stamps
 * `updatedAt = mergeHLC(existing, newHLC(node))` on every local write).
 * Returns undefined for legacy/empty payloads with no valid version.
 */
function extractClientHLC(payload: unknown): HLCTimestamp | undefined {
  const version = (payload as { version?: unknown } | null | undefined)?.version;
  if (!version || typeof version !== 'object') return undefined;
  const { wall, counter, node } = version as Record<string, unknown>;
  if (typeof wall !== 'number' || typeof counter !== 'number' || typeof node !== 'string') {
    return undefined;
  }
  return { wall, counter, node };
}

/**
 * Server-side sync handler — channel-based WebSocket relay.
 *
 * No CRDT merge on the server. It only:
 *  1. Accepts push batches from clients and persists events
 *  2. Broadcasts events to subscribers of the relevant channel (userId + channel)
 *  3. Handles pull requests for catch-up sync
 */
export class SyncHandler {
  private opts: SyncHandlerOptions;
  private sockets = new Map<string, ServerSocket>();
  /** channelKey ("userId:channel") → Set of deviceIds */
  private subscriptions = new Map<string, Set<string>>();

  constructor(opts: SyncHandlerOptions) {
    this.opts = opts;
  }

  /** Register a new WebSocket connection */
  connect(deviceId: string, socket: ServerSocket): void {
    this.sockets.set(deviceId, socket);
    socket.onClose(() => this.disconnect(deviceId));
  }

  /** Handle an incoming message from a client socket */
  handleMessage(deviceId: string, data: string): void {
    let msg: SyncMessage;
    try {
      msg = JSON.parse(data) as SyncMessage;
    } catch {
      return;
    }

    const socket = this.sockets.get(deviceId);
    if (!socket) return;

    switch (msg.type) {
      case 'subscribe':
        this.subscribe(deviceId, msg.deviceId, msg.channel);
        break;
      case 'unsubscribe':
        this.unsubscribe(deviceId, msg.deviceId, msg.channel);
        break;
      case 'push':
        this.handlePush(deviceId, socket, msg);
        break;
      case 'pull_seq':
        this.handlePullSeq(deviceId, socket, msg.deviceId, msg.channel, msg.from, msg.to);
        break;

    }
  }

  /** Subscribe a device to a channel (userId + channel) */
  subscribe(deviceId: string, userId: string, channel: string): void {
    const key = channelKey(userId, channel);
    let subs = this.subscriptions.get(key);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(key, subs);
    }
    subs.add(deviceId);
  }

  /** Unsubscribe a device from a channel */
  unsubscribe(deviceId: string, userId: string, channel: string): void {
    const key = channelKey(userId, channel);
    const subs = this.subscriptions.get(key);
    if (subs) {
      subs.delete(deviceId);
      if (subs.size === 0) this.subscriptions.delete(key);
    }
  }

  private handlePush(deviceId: string, socket: ServerSocket, msg: PushMessage): void {
    this.acceptPush(deviceId, msg.deviceId, msg.channel, msg.items).then((result) => {
      this.logPushResult(deviceId, channelKey(msg.deviceId, msg.channel), msg.items.length, result);
      socket.send(JSON.stringify({ type: 'push-ack', ...result }));
    }).catch((err) => {
      console.error(`[sync] push from dev=${deviceId} failed:`, err);
    });
  }



  private handlePullSeq(deviceId: string, socket: ServerSocket, userId: string, channel: string, from: number, to: number): void {
    this.sendEventsBySeq(deviceId, socket, userId, channel, from, to).catch(() => {
      // ignore pull errors silently
    });
  }



  /** Accept a push batch: persist events, return ack */
  async acceptPush(deviceId: string, userId: string, channel: string, items: unknown[]): Promise<PushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];

    for (const item of items) {
      const entry = item as { table?: string; operation?: string; recordId?: string; payload?: unknown; id: string };
      const id = entry.id ?? entry.recordId ?? 'unknown';

      if (!entry.table || !entry.operation || !entry.recordId) {
        rejected.push({ id, reason: 'missing required fields (table, operation, recordId)' });
        continue;
      }

      if (entry.operation !== 'create' && entry.operation !== 'update' && entry.operation !== 'delete') {
        rejected.push({ id, reason: `invalid operation '${entry.operation}'` });
        continue;
      }

      if (!SYNC_TABLE_SET.has(entry.table as any)) {
        rejected.push({ id, reason: `unknown table '${entry.table}'` });
        continue;
      }

      try {
        const event: SyncEvent = {
          // Persist under the client's raw queue-item id so the push-ack echoes
          // an id the client recognizes and can remove from its write-ahead
          // queue. Fall back to a fresh id only for legacy pushes with no id.
          id,
          // Placeholder — storage assigns the real seq from the DB (MAX+1) and
          // returns it on the stored event.
          seq: 0,
          table: entry.table,
          operation: entry.operation,
          recordId: entry.recordId,
          payload: entry.payload,
          deviceId,
          // The channel this event belongs to. seq is monotonic per channel
          // (assigned by storage), so the event must carry its channel key.
          channel: channelKey(userId, channel),
          // Preserve the writer's originating logical clock so LWW ordering
          // reflects writer logical time, not server arrival time. The record's
          // HLC travels in payload.version (see sync-client syncLocalChange).
          // Fall back to a fresh server stamp only for legacy/empty payloads.
          createdAt: extractClientHLC(entry.payload) ?? newHLC(deviceId),
        };
        const stored = await this.opts.storage.createSyncEvent(event);
        accepted.push(stored.id);
        // Broadcast to ALL subscribers including the origin device. Echoing the
        // event back to its writer keeps every client's per-channel seq stream
        // contiguous (the reorder buffer would otherwise stall on the hole left
        // by the client's own write). The client recognizes its own events by
        // event.deviceId and advances its buffer without re-applying them.
        // Broadcast the *stored* event so it carries the DB-assigned seq.
        this.broadcastToChannel(userId, channel, stored);
      } catch (err) {
        console.error(`[sync] storage error persisting event for ${id}:`, err);
        rejected.push({ id, reason: 'storage error' });
      }
    }

    return { accepted, rejected };
  }

  private logPushResult(deviceId: string, channelKeyStr: string, itemCount: number, result: PushResult): void {
    console.log(
      `[sync] push from dev=${deviceId} (${channelKeyStr}): ${itemCount} item(s), accepted=${result.accepted.length}, rejected=${result.rejected.length}`,
    );
    for (const r of result.rejected) {
      console.log(`[sync]   rejected ${r.id}: ${r.reason}`);
    }
  }

  /** Send events by sequence number range */
  async sendEventsBySeq(deviceId: string, socket: ServerSocket, userId: string, channel: string, from: number, to: number): Promise<void> {
    const events = await this.opts.storage.getEventsBySeq(from, to, channelKey(userId, channel));
    for (const event of events) {
      console.log(
        `[sync] send event seq=${event.seq} ${event.operation} ${event.table}/${event.recordId} from=${event.deviceId} -> ${deviceId} (${userId}:${channel}) [pull]`,
      );
      socket.send(JSON.stringify({ type: 'event', userId, channel, event }));
      this.opts.storage.trackEventDelivery(event.id, deviceId, channel);
    }
  }

  /** Broadcast an event to all subscribers of a channel except the origin device */
  broadcastToChannel(userId: string, channel: string, event: SyncEvent, excludeDeviceId?: string): void {
    const key = channelKey(userId, channel);
    const subs = this.subscriptions.get(key);
    if (!subs) return;

    const payload = JSON.stringify({ type: 'event', userId, channel, event });

    for (const deviceId of subs) {
      if (deviceId === excludeDeviceId) continue;
      const socket = this.sockets.get(deviceId);
      if (socket) {
        console.log(
          `[sync] relay event seq=${event.seq} ${event.operation} ${event.table}/${event.recordId} from=${event.deviceId} -> ${deviceId} (${userId}:${channel})`,
        );
        socket.send(payload);
        this.opts.storage.trackEventDelivery(event.id, deviceId, channel);
      }
    }

    this.opts.onBroadcast?.(event, excludeDeviceId);
  }

  /** Unregister a disconnected client and clean up all its subscriptions */
  disconnect(deviceId: string): void {
    this.sockets.delete(deviceId);
    for (const [key, subs] of this.subscriptions) {
      subs.delete(deviceId);
      if (subs.size === 0) this.subscriptions.delete(key);
    }
  }
}

function channelKey(userId: string, channel: string): string {
  return `${userId}:${channel}`;
}
