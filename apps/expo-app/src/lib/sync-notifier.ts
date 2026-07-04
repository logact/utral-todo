import { DeviceEventEmitter } from 'react-native';

const SYNC_DB_CHANGED = 'sync:db:changed';

export interface DbChangeDetail {
  table: string;
  operation: string;
  recordId: string;
}

export function emitDbChange(detail: DbChangeDetail): void {
  DeviceEventEmitter.emit(SYNC_DB_CHANGED, detail);
}

export function onDbChange(handler: (detail: DbChangeDetail) => void): () => void {
  const subscription = DeviceEventEmitter.addListener(SYNC_DB_CHANGED, handler);
  return () => subscription.remove();
}
