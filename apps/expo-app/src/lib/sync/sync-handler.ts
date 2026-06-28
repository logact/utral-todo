import type { SyncHandlerOptions } from '@utral/sync-client';
import { SyncClientHandler } from '@utral/sync-client';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ExpoSqliteStorage } from './sqlite-storage.js';
import { ExpoWebSocketTransport } from './websocket-transport.js';

export interface ExpoSyncOptions extends Omit<SyncHandlerOptions, 'transport' | 'storage'> {
  db: SQLiteDatabase;
}

export class ExpoSyncHandler extends SyncClientHandler {
  constructor(opts: ExpoSyncOptions) {
    const storage = new ExpoSqliteStorage(opts.db);
    super({
      ...opts,
      storage,
      transport: new ExpoWebSocketTransport(),
    });
  }

  async init(): Promise<void> {
    const storage = (this as any).opts.storage as ExpoSqliteStorage;
    await storage.init();
  }
}
