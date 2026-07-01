import type { SyncHandlerOptions } from '@utral/sync-client';
import { SyncClientHandler } from '@utral/sync-client';
import { createSqliteSyncStorage, type SqliteSyncStorage } from '@utral/db-schema/storage';
import { db } from '../../db';
import { ExpoWebSocketTransport } from './websocket-transport';

export type ExpoSyncOptions = Omit<SyncHandlerOptions, 'transport' | 'storage'>;

export class ExpoSyncHandler extends SyncClientHandler {
  constructor(opts: ExpoSyncOptions) {
    const storage = createSqliteSyncStorage(db);
    super({
      ...opts,
      storage,
      transport: new ExpoWebSocketTransport(),
    });
  }

  async init(): Promise<void> {
    const storage = (this as any).opts.storage as SqliteSyncStorage;
    await storage.init();
  }
}
