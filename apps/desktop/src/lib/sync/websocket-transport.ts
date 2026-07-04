import type { SyncSocket } from '@utral/sync-client';
import WebSocket from '@tauri-apps/plugin-websocket';

export class TauriWebSocketTransport {
  connect(url: string): SyncSocket {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

    const socket: SyncSocket = {
      send(data: string) {
        wsPromise.then((ws) => ws.send(data));
      },
      close() {
        wsPromise.then((ws) => ws.disconnect());
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

    const wsPromise = WebSocket.connect(url).then((ws) => {
      ws.addListener((message) => {
        if (message.type === 'Text') {
          handlers.get('message')?.forEach((h) =>
            (h as (data: string) => void)(message.data)
          );
        } else if (message.type === 'Close') {
          handlers.get('close')?.forEach((h) => (h as () => void)());
        }
      });

      handlers.get('open')?.forEach((h) => (h as () => void)());

      return ws;
    }).catch((err) => {
      setTimeout(() => handlers.get('error')?.forEach((h) => h(err)), 0);
      throw err;
    });

    return socket;
  }
}
