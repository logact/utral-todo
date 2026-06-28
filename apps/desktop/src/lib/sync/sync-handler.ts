import type { SyncHandlerOptions } from '@utral/sync-client';
import { SyncClientHandler } from '@utral/sync-client';
import Database from '@tauri-apps/plugin-sql';
import { TauriSqliteStorage } from './sqlite-storage.js';
import { TauriWebSocketTransport } from './websocket-transport.js';

export interface TauriSyncOptions extends Omit<SyncHandlerOptions, 'transport' | 'storage'> {
  db: Database;
}

export class TauriSyncHandler extends SyncClientHandler {
  constructor(opts: TauriSyncOptions) {
    const storage = new TauriSqliteStorage(opts.db);
    super({
      ...opts,
      storage,
      transport: new TauriWebSocketTransport(),
    });
  }

  async init(): Promise<void> {
    const storage = (this as any).opts.storage as TauriSqliteStorage;
    await storage.init();
  }
}
