import type { SyncHandlerOptions, SyncClientState } from '@utral/sync-client';
import { SyncClientHandler } from '@utral/sync-client';
import { createSqliteSyncStorage, type SqliteSyncStorage } from '@utral/db-schema/storage';
import { db } from '../../db';
import { ExpoWebSocketTransport } from './websocket-transport';

export type ExpoSyncOptions = Omit<SyncHandlerOptions, 'transport' | 'storage'> & {
  onStateChange?: (state: SyncClientState) => void;
};

export class ExpoSyncHandler extends SyncClientHandler {
  constructor(opts: ExpoSyncOptions) {
    const storage = createSqliteSyncStorage(db);
    const { onStateChange, ...rest } = opts;
    super({
      ...rest,
      storage,
      transport: new ExpoWebSocketTransport(),
    });
    if (onStateChange) {
      this.onStateChange = onStateChange;
    }
  }

  async init(): Promise<void> {
    const storage = (this as any).opts.storage as SqliteSyncStorage;
    await storage.init();
  }
}
