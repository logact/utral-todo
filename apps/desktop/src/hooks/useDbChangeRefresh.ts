import { useEffect } from 'react';

export function useDbChangeRefresh(
  refresh: () => void,
  options?: { delay?: number; skipInitial?: boolean }
) {
  const delay = options?.delay ?? 100;
  const skipInitial = options?.skipInitial ?? false;

  useEffect(() => {
    if (!skipInitial) refresh();

    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => refresh(), delay);
    };

    window.addEventListener('sync:remote-applied', handler);
    window.addEventListener('db:changed', handler);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('sync:remote-applied', handler);
      window.removeEventListener('db:changed', handler);
    };
  }, [refresh, delay, skipInitial]);
}
