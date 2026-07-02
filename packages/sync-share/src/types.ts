import type { HLCTimestamp, SyncEvent } from './hlc.js';

export type { HLCTimestamp, SyncEvent } from './hlc.js';
export { compareHLC, maxHLC, newHLC, mergeHLC, hlcToDate, dateToHLC, hlcToString, stringToHLC } from './hlc.js';

// --- Core record shape ---
export interface SyncableRecord {
  id: string;
  version: HLCTimestamp;
  isDeleted: boolean;
  [key: string]: unknown;
}

// --- Queue item (local write-ahead log) ---
export interface SyncQueueItem {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload: unknown;
  createdAt: Date;
  retryCount: number;
  lastError?: string;
}

// --- Status enums ---
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
export type ConflictDecision = 'adopt' | 'skip' | 'delete';

export interface ApplyRemoteResult {
  decision: ConflictDecision;
  merged?: SyncableRecord;
}

// --- Wire protocol ---
export interface SyncWireMessage {
  type: 'push' | 'ack' | 'push-ack' | 'event' | 'pull_request' | 'pull_response';
  [key: string]: unknown;
}

export interface SyncPushMessage extends SyncWireMessage {
  type: 'push';
  deviceId: string;
  items: SyncQueueItem[];
}

export interface SyncAckMessage extends SyncWireMessage {
  type: 'ack';
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
}

export interface SyncPushAckMessage extends SyncWireMessage {
  type: 'push-ack';
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
}

export interface SyncEventMessage extends SyncWireMessage {
  type: 'event';
  event: SyncEvent;
}

export interface SyncPullRequest extends SyncWireMessage {
  type: 'pull_request';
  deviceId: string;
  since?: Date;
}

export interface SyncPullResponse extends SyncWireMessage {
  type: 'pull_response';
  events: SyncEvent[];
}

// --- Server storage (relay-only, no merge) ---
export interface ServerSyncStorage {
  /**
   * Persist a pushed event and return it as stored.
   *
   * The event is persisted under the caller-provided `id` (the client's raw
   * queue-item id), so `push-ack` can echo an id the client recognizes. The
   * storage assigns `seq` itself from the DB — the next value in the event's
   * own `channel` (`MAX(seq) + 1 WHERE channel = event.channel`), so seq is
   * monotonic per channel — and returns the event with the assigned `seq`.
   * Callers must use the returned event (not the one they passed) when
   * broadcasting.
   */
  createSyncEvent(syncEvent: SyncEvent): Promise<SyncEvent>;
  getEventsSince(since: Date): Promise<SyncEvent[]>;
  getEventsSinceHLC(since: HLCTimestamp): Promise<SyncEvent[]>;
  /** Replay a seq range within a single channel (seq is per-channel). */
  getEventsBySeq(from: number, to: number, channel: string): Promise<SyncEvent[]>;
  trackEventDelivery(eventId: string, deviceId: string, channel: string): void;
  ackEventDelivery(deviceId: string, eventIds: string[]): void;
  getPendingEventsForDevice(deviceId: string): Promise<SyncEvent[]>;
}

// --- Common config ---
export interface SyncEngineConfig {
  serverUrl: string;
  queueDebounceMs?: number;
  maxRetries?: number;
}
