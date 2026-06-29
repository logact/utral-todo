import { useEffect } from 'react';

export function useDbChangeRefresh(
  refresh: () => void,
  options?: { delay?: number; skipInitial?: boolean; tables?: string[] }
) {
  const delay = options?.delay ?? 100;
  const skipInitial = options?.skipInitial ?? false;
  const tables = options?.tables;

  useEffect(() => {
    if (!skipInitial) refresh();

    let timeout: ReturnType<typeof setTimeout>;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (tables && detail?.table && !tables.includes(detail.table)) return;
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), delay);
    };   
     

    window.addEventListener('db:changed', handler);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('db:changed', handler);
    };
  }, [refresh, delay, skipInitial]);
}
