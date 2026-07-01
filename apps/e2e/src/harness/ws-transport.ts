import { WebSocket } from 'ws';
import type { SyncSocket, SyncTransport } from '@utral/sync-client';

/**
 * A `SyncTransport` backed by the Node `ws` client. Structurally identical to the
 * desktop `TauriWebSocketTransport` / expo `ExpoWebSocketTransport`, but imports
 * `WebSocket` from `ws` instead of relying on a browser/RN global so it runs in
 * plain Node.
 */
export class WsTransport implements SyncTransport {
  connect(url: string): SyncSocket {
    const ws = new WebSocket(url);

    const socket: SyncSocket = {
      send(data: string) {
        ws.send(data);
      },
      close() {
        ws.close();
      },
      onMessage(handler) {
        ws.on('message', (data) => handler(data.toString()));
      },
      onOpen(handler) {
        ws.on('open', () => handler());
      },
      onClose(handler) {
        ws.on('close', () => handler());
      },
      onError(handler) {
        ws.on('error', (err) => handler(err));
      },
    };

    return socket;
  }
}
