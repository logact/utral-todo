import { useEffect, useRef } from 'react';
import { onDbChange, type DbChangeDetail } from '../lib/sync-notifier';

export function useDbChangeRefresh(
  refresh: () => void,
  options?: { tables?: string[] }
) {
  const tables = options?.tables;
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (detail: DbChangeDetail) => {
      if (tables && detail.table && !tables.includes(detail.table)) return;
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => refresh(), 50);
    };

    const unsub = onDbChange(handler);
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
      unsub();
    };
  }, [refresh, tables]);
}
