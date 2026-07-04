import type { SyncSocket } from '@utral/sync-client';

export class TauriWebSocketTransport {
  connect(url: string): SyncSocket {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

    const socket: SyncSocket = {
      send(data: string) {
        ws.send(data);
      },
      close() {
        ws.close();
      },
      onMessage(handler) {
        let h = handlers.get('message');
        if (!h) {
          h = new Set();
          handlers.set('message', h);
        }
        h.add(handler as (...args: unknown[]) => void);
      },
      onOpen(handler) {
        let h = handlers.get('open');
        if (!h) {
          h = new Set();
          handlers.set('open', h);
        }
        h.add(handler as (...args: unknown[]) => void);
      },
      onClose(handler) {
        let h = handlers.get('close');
        if (!h) {
          h = new Set();
          handlers.set('close', h);
        }
        h.add(handler as (...args: unknown[]) => void);
      },
      onError(handler) {
        let h = handlers.get('error');
        if (!h) {
          h = new Set();
          handlers.set('error', h);
        }
        h.add(handler as (...args: unknown[]) => void);
      },
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setTimeout(() => handlers.get('error')?.forEach((h) => h(err)), 0);
      return socket;
    }

    ws.onopen = () => {
      handlers.get('open')?.forEach((h) => (h as () => void)());
    };

    ws.onclose = () => {
      handlers.get('close')?.forEach((h) => (h as () => void)());
    };

    ws.onerror = (event) => {
      handlers.get('error')?.forEach((h) => (h as (err: unknown) => void)(event));
    };

    ws.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data);
      handlers.get('message')?.forEach((h) => (h as (data: string) => void)(data));
    };

    return socket;
  }
}
