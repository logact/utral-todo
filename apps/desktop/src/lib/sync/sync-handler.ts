import type { SyncHandlerOptions } from '@utral/sync-client';
import { SyncClientHandler } from '@utral/sync-client';
import { createSqliteSyncStorage, type SqliteSyncStorage } from '@utral/db-schema/storage';
import { db } from '../../db/drizzle-adapter';
import { TauriWebSocketTransport } from './websocket-transport.js';

export type TauriSyncOptions = Omit<SyncHandlerOptions, 'transport' | 'storage'>;

export class TauriSyncHandler extends SyncClientHandler {
  constructor(opts: TauriSyncOptions) {
    const storage = createSqliteSyncStorage(db);
    super({
      ...opts,
      storage,
      transport: new TauriWebSocketTransport(),
    });
  }

  async init(): Promise<void> {
    const storage = (this as any).opts.storage as SqliteSyncStorage;
    await storage.init();
  }
}
