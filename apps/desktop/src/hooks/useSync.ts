import { useEffect, useState, useCallback } from 'react';
import { getSyncConfig } from '../db/sync';
import { start, stop, getSyncStatus, processQueue } from '../db/syncEngine';
import { db } from '../db/database';

export function useSync() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const config = getSyncConfig();
    if (!config?.serverUrl) {
      setSyncStatus('idle');
      return;
    }

    setSyncStatus('syncing');
    start().catch((err) => {
      console.error('[useSync] Failed to start:', err);
      setSyncStatus('error');
    });

    // Poll pending count
    const interval = setInterval(() => {
      db.syncQueue.count().then((count) => {
        setPendingCount(count);
        const status = getSyncStatus();
        if (count > 0) {
          setSyncStatus(status.connected ? 'syncing' : 'offline');
        } else {
          setSyncStatus(status.connected ? 'idle' : 'offline');
        }
      }).catch(() => {});
    }, 2000);

    return () => {
      clearInterval(interval);
      stop();
    };
  }, []);

  const forceSync = useCallback(() => {
    processQueue().catch((err) => {
      console.error('[useSync] Force sync failed:', err);
    });
  }, []);

  return { syncStatus, pendingCount, forceSync };
}
