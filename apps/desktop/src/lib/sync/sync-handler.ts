import type { SyncHandlerOptions } from '@utral/sync-client';
import { SyncClientHandler } from '@utral/sync-client';
import { TauriSqliteStorage } from './sqlite-storage.js';
import { TauriWebSocketTransport } from './websocket-transport.js';

export type TauriSyncOptions = Omit<SyncHandlerOptions, 'transport' | 'storage'>;

export class TauriSyncHandler extends SyncClientHandler {
  constructor(opts: TauriSyncOptions) {
    const storage = new TauriSqliteStorage();
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
