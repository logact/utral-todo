import type { SyncHandlerOptions, ServerSocket, PushResult, PushMessage, SyncMessage } from './types.js';
import type { HLCTimestamp, SyncEvent } from '@utral/sync-share';
import { newHLC } from '@utral/sync-share';
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
  /** channelKey → next sequence number */
  private seqCounters = new Map<string, number>();

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
      case 'event_ack':
        this.handleEventAck(msg.deviceId, msg.eventIds);
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
      socket.send(JSON.stringify({ type: 'push-ack', ...result }));
    }).catch(() => {
      // ignore push errors silently
    });
  }



  private handlePullSeq(deviceId: string, socket: ServerSocket, userId: string, channel: string, from: number, to: number): void {
    this.sendEventsBySeq(deviceId, socket, userId, channel, from, to).catch(() => {
      // ignore pull errors silently
    });
  }

  private handleEventAck(deviceId: string, eventIds: string[]): void {
    this.opts.storage.ackEventDelivery(deviceId, eventIds);
  }

  /** Accept a push batch: persist events, return ack */
  async acceptPush(deviceId: string, userId: string, channel: string, items: unknown[]): Promise<PushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];
    const channelKeyStr = channelKey(userId, channel);

    for (const item of items) {
      const entry = item as { table?: string; operation?: string; recordId?: string; payload?: unknown; id?: string };
      const id = entry.id ?? entry.recordId ?? 'unknown';

      if (!entry.table || !entry.operation || !entry.recordId) {
        rejected.push({ id, reason: 'missing required fields (table, operation, recordId)' });
        continue;
      }

      if (!this.opts.tables.includes(entry.table)) {
        rejected.push({ id, reason: `table '${entry.table}' is not registered` });
        continue;
      }

      if (entry.operation !== 'create' && entry.operation !== 'update' && entry.operation !== 'delete') {
        rejected.push({ id, reason: `invalid operation '${entry.operation}'` });
        continue;
      }

      try {
        const seq = this.nextSeq(channelKeyStr);
        const event: SyncEvent = {
          id: randomUUID(),
          seq,
          table: entry.table,
          operation: entry.operation,
          recordId: entry.recordId,
          payload: entry.payload,
          deviceId,
          // Preserve the writer's originating logical clock so LWW ordering
          // reflects writer logical time, not server arrival time. The record's
          // HLC travels in payload.version (see sync-client syncLocalChange).
          // Fall back to a fresh server stamp only for legacy/empty payloads.
          createdAt: extractClientHLC(entry.payload) ?? newHLC(deviceId),
        };
        await this.opts.storage.createSyncEvent(event);
        accepted.push(event.id);
        // Broadcast to ALL subscribers including the origin device. Echoing the
        // event back to its writer keeps every client's per-channel seq stream
        // contiguous (the reorder buffer would otherwise stall on the hole left
        // by the client's own write). The client recognizes its own events by
        // event.deviceId and advances its buffer without re-applying them.
        this.broadcastToChannel(userId, channel, event);
      } catch {
        rejected.push({ id, reason: 'storage error' });
      }
    }

    return { accepted, rejected };
  }

  private nextSeq(channelKey: string): number {
    const current = this.seqCounters.get(channelKey) ?? 0;
    const next = current + 1;
    this.seqCounters.set(channelKey, next);
    return next;
  }

  

  /** Send events by sequence number range */
  async sendEventsBySeq(deviceId: string, socket: ServerSocket, userId: string, channel: string, from: number, to: number): Promise<void> {
    const events = await this.opts.storage.getEventsBySeq(from, to);
    for (const event of events) {
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
