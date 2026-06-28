import { isDeleted } from './crdt.js';
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
  type: 'push' | 'ack' | 'push-ack' | 'event' | 'event_ack' | 'pull_request' | 'pull_response';
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

export interface SyncEventAckMessage extends SyncWireMessage {
  type: 'event_ack';
  deviceId: string;
  eventIds: string[];
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
  createSyncEvent(syncEvent: SyncEvent): Promise<SyncEvent>;
  getEventsSince(since: Date): Promise<SyncEvent[]>;
  getEventsSinceHLC(since: HLCTimestamp): Promise<SyncEvent[]>;
  getEventsBySeq(from: number, to: number): Promise<SyncEvent[]>;
  trackEventDelivery(eventId: string, deviceId: string, channel: string): void;
  ackEventDelivery(deviceId: string, eventIds: string[]): void;
  getPendingEventsForDevice(deviceId: string): Promise<SyncEvent[]>;
}

// --- Common config ---
export interface SyncEngineConfig {
  serverUrl: string;
  tables: string[];
  tableNameMap?: Record<string, string>;
  tableOrder: Record<string, number>;
  queueDebounceMs?: number;
  maxRetries?: number;
}
