export { SyncHandler } from './sync-handler.js';
export { SqliteSyncStorage } from './sqlite-storage.js';
export type { SyncHandlerOptions, PushResult, ServerSocket, SyncMessage, PushMessage, PullMessage, SubscribeMessage, UnsubscribeMessage } from './types.js';

// Re-export core types needed by server consumers
export type {
  SyncableRecord,
  ServerSyncStorage,
  SyncStatus,
  HLCTimestamp,
  SyncEvent,
} from '@utral/sync-share';
export { shouldAdoptRemote, mergeRecords, isDeleted, hlcFromParts, hlcToParts } from '@utral/sync-share';
export type { CRDTRecord } from '@utral/sync-share';
export { newHLC, mergeHLC, compareHLC, maxHLC, hlcToDate, dateToHLC, hlcToString, stringToHLC } from '@utral/sync-share';
