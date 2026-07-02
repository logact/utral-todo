import type { HLCTimestamp, SyncEvent } from '@utral/sync-share';

export type { HLCTimestamp, SyncEvent } from '@utral/sync-share';

export interface SyncQueueItem {
  id: string;
  [key: string]: unknown;
}

export interface SyncableRecord {
  id: string;
  version: HLCTimestamp;
  [key: string]: unknown;
}

// --- Storage interfaces (client-side) ---
export interface SyncQueueStorage {
  addToQueue(item: SyncQueueItem): Promise<void>;
  getQueueItems(): Promise<SyncQueueItem[]>;
  deleteQueueItem(id: string): Promise<void>;
  updateQueueItem(id: string, changes: Partial<SyncQueueItem>): Promise<void>;
}

export interface SyncRecordStorage {
  getRecord(table: string, id: string): Promise<SyncableRecord | undefined>;
  addRecord(table: string, record: SyncableRecord): Promise<void>;
  updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void>;
  deleteRecord(table: string, id: string): Promise<void>;
}

export interface SyncStateStorage {
  getDeviceId(): Promise<string | undefined>;
  setDeviceId(id: string): Promise<void>;
  getLastSyncAt(): Promise<Date | undefined>;
  setLastSyncAt(date: Date): Promise<void>;
  /** Highest per-channel seq the client has processed in order (resume point). */
  getLastSeq(): Promise<number | undefined>;
  setLastSeq(seq: number): Promise<void>;
}

// --- Event emitter ---
export interface SyncEventEmitter {
  emitRemoteApplied(table: string, operation: string, recordId: string): void;
}

// --- WebSocket types (client-side) ---
export interface SyncSocket {
  send(data: string): void;
  close(): void;
  onMessage(handler: (data: string) => void): void;
  onOpen(handler: () => void): void;
  onClose(handler: () => void): void;
  onError(handler: (err: unknown) => void): void;
}

// --- Client transport (platform-agnostic) ---
export interface SyncTransport {
  /** Create a WebSocket connection to the sync server */
  connect(url: string): SyncSocket;
}

// --- Client connection state ---
export type SyncClientState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

// --- Reconnect config ---
export interface ReconnectConfig {
  /** Maximum number of reconnect attempts (default: 10) */
  maxRetries: number;
  /** Initial delay before first reconnect in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay between reconnects in ms (default: 30000) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 1.5) */
  backoffMultiplier: number;
}

// --- Client message handlers (typed per message type) ---
export interface SyncClientMessageHandlers {
  'push-ack': (accepted: string[], rejected: Array<{ id: string; reason: string }>) => void;
  'event': (event: SyncEvent) => void;
  'pull_response': (events: SyncEvent[]) => void;
}
