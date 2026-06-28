import type { SyncSocket } from '@utral/sync-client';

export class ExpoWebSocketTransport {
  private handlers = new Map<string, Set<Function>>();

  connect(url: string): SyncSocket {
    const handlers = new Map<string, Set<Function>>();

    const ws = new WebSocket(url);

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
        h.add(handler);
      },
      onOpen(handler) {
        let h = handlers.get('open');
        if (!h) {
          h = new Set();
          handlers.set('open', h);
        }
        h.add(handler);
      },
      onClose(handler) {
        let h = handlers.get('close');
        if (!h) {
          h = new Set();
          handlers.set('close', h);
        }
        h.add(handler);
      },
      onError(handler) {
        let h = handlers.get('error');
        if (!h) {
          h = new Set();
          handlers.set('error', h);
        }
        h.add(handler);
      },
    };

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
