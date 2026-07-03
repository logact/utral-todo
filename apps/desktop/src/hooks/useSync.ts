import { useEffect, useState, useCallback } from 'react';
import { getSyncConfig } from '../db/sync';
import { start, stop, getSyncStatus, processQueue } from '../lib/sync/syncEngine';

export function useSync() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    (async () => {
      const config = await getSyncConfig();
      if (cancelled) return;
      if (!config?.serverUrl) {
        setSyncStatus('idle');
        return;
      }

      setSyncStatus('syncing');
      start().catch((err) => {
        console.error('[useSync] Failed to start:', err);
        setSyncStatus('error');
      });

      interval = setInterval(() => {
        try {
          const status = getSyncStatus();
          setPendingCount(status.pendingCount);
          if (status.connected) {
            setSyncStatus(status.pendingCount > 0 ? 'syncing' : 'idle');
          } else {
            setSyncStatus('offline');
          }
        } catch {
          setSyncStatus('offline');
        }
      }, 2000);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
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
