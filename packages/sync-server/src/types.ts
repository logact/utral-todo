import type { SyncEvent, ServerSyncStorage, HLCTimestamp } from '@utral/sync-share';

export type { ServerSyncStorage } from '@utral/sync-share';

/** WebSocket connection abstraction (framework-agnostic) */
export interface ServerSocket {
  id: string;
  send(data: string): void;
  onClose(cb: () => void): void;
}

/** Result of accepting a push batch */
export interface PushResult {
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
}

/** Server sync handler options */
export interface SyncHandlerOptions {
  storage: ServerSyncStorage;
  tables: string[];
  /** Called after an event is persisted — for external broadcast hooks */
  onBroadcast?: (event: SyncEvent, excludeDeviceId?: string) => void;
}

// --- Message protocol types ---

export interface SubscribeMessage {
  type: 'subscribe';
  deviceId: string;
  channel: string;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  deviceId: string;
  channel: string;
}

export interface PushMessage {
  type: 'push';
  deviceId: string;
  channel: string;
  items: Array<SyncEvent>;
}

export interface PullMessage {
  type: 'pull';
  deviceId: string;
  channel: string;
  /** ISO date string — if omitted, returns all events */
  since?: HLCTimestamp;
}

export interface PullSeqMessage {
  type: 'pull_seq';
  deviceId: string;
  channel: string;
  from: number;
  to: number;
}

export type SyncMessage = SubscribeMessage | UnsubscribeMessage | PushMessage | PullMessage | PullSeqMessage;
