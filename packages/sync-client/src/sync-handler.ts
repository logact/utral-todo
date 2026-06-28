import type {
  SyncEngineConfig,
  SyncStatus,
  SyncWireMessage,
  SyncEvent,
  SyncableRecord,
  HLCTimestamp,
} from '@utral/sync-share';
import { compareHLC } from '@utral/sync-share';

const MIN_HLC: HLCTimestamp = { wall: 0, counter: 0, node: '' };
import type {
  SyncQueueStorage,
  SyncRecordStorage,
  SyncStateStorage,
  SyncEventEmitter,
  SyncTransport,
  SyncSocket,
  SyncClientState,
  ReconnectConfig,
  SyncClientMessageHandlers,
} from './types.js';
import { ReorderBuffer } from './reorder-buffer.js';

/** Options for the sync client handler */
export interface SyncHandlerOptions extends SyncEngineConfig {
  storage: SyncQueueStorage & SyncRecordStorage & SyncStateStorage;
  transport: SyncTransport;
  emitter: SyncEventEmitter;
  deviceId: string;
  userId: string;
  channel: string;
  /** Reconnection config. Set to null to disable auto-reconnect. */
  reconnect?: ReconnectConfig | null;
  reorderBufferSize?: number;
  reorderBufferThresholdSize?: number;
  reorderBufferTimeoutMs?: number;
}

const DEFAULT_RECONNECT: ReconnectConfig = {
  maxRetries: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 1.5,
};

/**
 * WebSocket-style sync client handler.
 *
 * Lifecycle:
 *  1. construct(handler) → idle
 *  2. connect()          → connecting → connected
 *  3. socket drops       → reconnecting → connected (auto-retry with backoff)
 *  4. disconnect()       → disconnected (no retry)
 *
 * Message routing:
 *  - Raw WebSocket messages are parsed and dispatched to typed handlers
 *  - Use on('event', ...) to register per-type handlers
 *  - Built-in handlers: event → reorder buffer → applyRemoteEvent + batched ACK
 *
 * Subclass per platform and provide platform-specific storage + transport.
 */
export class SyncClientHandler {
  private opts: SyncHandlerOptions;
  private _state: SyncClientState = 'idle';
  private socket: SyncSocket | null = null;
  private reconnectConfig: ReconnectConfig | null;

  // Reconnect state
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Message handlers (typed per message type)
  private messageHandlers = new Map<string, Set<Function>>();

  // Reorder buffer
  private reorderBuffer: ReorderBuffer<SyncEvent>;

  // Batched ACKs
  private pendingAckIds: string[] = [];
  private ackTimer: ReturnType<typeof setTimeout> | null = null;

  // Subclass hooks (override in subclass)
  protected onStateChange?: (state: SyncClientState) => void;
  protected onError?: (err: unknown) => void;

  constructor(opts: SyncHandlerOptions) {
    this.opts = opts;
    this.reconnectConfig = opts.reconnect === null ? null : { ...DEFAULT_RECONNECT, ...opts.reconnect };

    this.reorderBuffer = new ReorderBuffer<SyncEvent>(
      {
        maxSize: opts.reorderBufferSize ?? 100,
        thresholdSize: opts.reorderBufferThresholdSize ?? 50,
        thresholdTime: opts.reorderBufferTimeoutMs ?? 5000,
      },
      {
        onReady: (event) => {
          this.applyRemoteEvent(event);
          this.enqueueAck(event.id);
        },
        pullMissing: (from, to) => this.pullMissingEvents(from, to),
      }
    );

    this.registerBuiltinHandlers();
  }

  // ─── Public API ────────────────────────────────────────────────────

  get state(): SyncClientState {
    return this._state;
  }

  /** Connect to the sync server. Resolves when the socket is open. */
  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') return;

    this.setState('connecting');
    try {
      await this.openSocket();
      this.reconnectAttempts = 0;
      this.setState('connected');
    } catch (err) {
      this.setState('error');
      this.onError?.(err);
      this.scheduleReconnect();
    }
  }

  /** Gracefully disconnect. No auto-reconnect. */
  disconnect(): void {
    this.cancelReconnect();
    this.cancelAckTimer();
    this.reorderBuffer.reset();
    this.socket?.close();
    this.socket = null;
    this.setState('disconnected');
  }

  /** Subscribe to typed server messages */
  on<K extends keyof SyncClientMessageHandlers>(type: K, handler: SyncClientMessageHandlers[K]): void {
    let handlers = this.messageHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(type, handlers);
    }
    handlers.add(handler);
  }

  /** Unsubscribe from a typed server message */
  off<K extends keyof SyncClientMessageHandlers>(type: K, handler: SyncClientMessageHandlers[K]): void {
    this.messageHandlers.get(type)?.delete(handler);
  }

  /** Send a message over the WebSocket connection */
  send(msg: SyncWireMessage): void {
    if (!this.socket) throw new Error('Not connected');
    this.socket.send(JSON.stringify(msg));
  }

  /** Enqueue a local change and push via WebSocket */
  async onLocalChange(table: string, operation: 'create' | 'update' | 'delete', recordId: string): Promise<void> {
    await this.opts.storage.addToQueue({
      id: crypto.randomUUID(),
      table,
      operation,
      recordId,
      payload: {},
      createdAt: new Date(),
      retryCount: 0,
    });
    this.opts.emitter.emitLocalChanged(table, operation, recordId);
    await this.flushQueue();
  }

  /** Force flush the local queue */
  async forceSync(): Promise<void> {
    await this.flushQueue();
  }

  // ─── Built-in message handlers ─────────────────────────────────────

  private registerBuiltinHandlers(): void {
    this.on('event', (event) => this.handleEventThroughBuffer(event));

    this.on('push-ack', (accepted, rejected) => {
      // Remove accepted items from queue
      for (const id of accepted) {
        this.opts.storage.deleteQueueItem(id);
      }
      // Update retry info for rejected items
      for (const { id, reason } of rejected) {
        this.opts.storage.updateQueueItem(id, {
          retryCount: 1,
          lastError: reason,
        });
      }
    });

    this.on('pull_response', (events) => {
      for (const event of events) {
        this.handleEventThroughBuffer(event);
      }
    });
  }

  // ─── Connection management ─────────────────────────────────────────

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.opts.transport.connect(this.opts.serverUrl);

      socket.onOpen(() => {
        this.socket = socket;
        resolve();
      });

      socket.onClose(() => {
        this.socket = null;
        if (this._state === 'connected') {
          this.scheduleReconnect();
        }
      });

      socket.onError((err) => {
        if (this._state === 'connecting') {
          reject(err);
        } else {
          this.onError?.(err);
        }
      });

      socket.onMessage((data) => this.handleRawMessage(data));
    });
  }

  // ─── Reconnection ──────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (!this.reconnectConfig) return;
    if (this.reconnectAttempts >= this.reconnectConfig.maxRetries) {
      this.setState('error');
      this.onError?.(new Error(`Max reconnect attempts (${this.reconnectConfig.maxRetries}) reached`));
      return;
    }

    this.setState('reconnecting');
    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private getReconnectDelay(): number {
    const cfg = this.reconnectConfig!;
    const delay = cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, this.reconnectAttempts);
    return Math.min(delay, cfg.maxDelayMs);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Message routing ───────────────────────────────────────────────

  private handleRawMessage(data: string): void {
    let msg: SyncWireMessage;
    try {
      msg = JSON.parse(data) as SyncWireMessage;
    } catch {
      return;
    }

    const handlers = this.messageHandlers.get(msg.type as string);
    if (!handlers || handlers.size === 0) return;

    // Extract typed args from the message
    switch (msg.type) {
      case 'push-ack':
        for (const h of handlers) {
          (h as SyncClientMessageHandlers['push-ack'])(
            (msg as any).accepted,
            (msg as any).rejected
          );
        }
        break;
      case 'event':
        for (const h of handlers) {
          (h as SyncClientMessageHandlers['event'])(
            (msg as any).event
          );
        }
        break;
      case 'pull_response':
        for (const h of handlers) {
          (h as SyncClientMessageHandlers['pull_response'])(
            (msg as any).events
          );
        }
        break;
    }
  }

  // ─── Queue flush ───────────────────────────────────────────────────

  protected async flushQueue(): Promise<void> {
    if (this._state !== 'connected') return;

    const items = await this.opts.storage.getQueueItems();
    if (items.length === 0) return;

    this.send({
      type: 'push',
      deviceId: this.opts.deviceId,
      items,
    } as any);
  }

  // ─── CRDT merge (default LWW strategy) ─────────────────────────────

  protected async applyRemoteEvent(event: SyncEvent): Promise<void> {
    const { table, recordId, operation, payload } = event;
    const incomingData = payload as SyncableRecord | undefined;

    if (!incomingData) return;

    const existingRecord = await this.opts.storage.getRecord(table, recordId);

    const incomingUpdatedAt = event.createdAt;
    const existingUpdatedAt = existingRecord?.version ?? MIN_HLC;
    const comparison = compareHLC(incomingUpdatedAt, existingUpdatedAt);



    if (operation === 'create') {
      if (!existingRecord) {
        incomingData.version = event.createdAt;
        await this.opts.storage.addRecord(table, incomingData);
        this.opts.emitter.emitRemoteApplied(table, 'create', recordId);
        return;
      }
      if (comparison > 0) {

        // merge the incoming data with the existing record
        const syncableRecord: SyncableRecord = { ...existingRecord, ...incomingData }
        syncableRecord.version = event.createdAt;
        if (syncableRecord.deletedAt) {
          syncableRecord.isDeleted = false;
        }
        await this.opts.storage.updateRecord(table, recordId, syncableRecord);
        this.opts.emitter.emitRemoteApplied(table, 'create', recordId);
        return

      } else {
        // merge the incoming data with the existing record,but the existing record is newer, so we keep the existing record's version
        const syncableRecord: SyncableRecord = { ...incomingData, ...existingRecord }
        syncableRecord.version = existingRecord.version;
        await this.opts.storage.updateRecord(table, recordId, syncableRecord);
        this.opts.emitter.emitRemoteApplied(table, 'create', recordId);
      }

      return;

    }


    if (operation === 'update' || operation === 'delete') {

      if (operation === 'delete') {
        incomingData.isDeleted = true;
      }

      if (!existingRecord) {
        incomingData.version = event.createdAt;
        await this.opts.storage.addRecord(table, incomingData);
        this.opts.emitter.emitRemoteApplied(table, operation, recordId);
        return;
      }

      if (comparison > 0) {
        const syncableRecord: SyncableRecord = { ...existingRecord, ...incomingData }
        syncableRecord.version = event.createdAt;
        await this.opts.storage.updateRecord(table, recordId, syncableRecord);
        this.opts.emitter.emitRemoteApplied(table, operation, recordId);
      } else {
        // merge the incoming data with the existing record,but the existing record is newer, so we keep the existing record's versio
        const syncableRecord: SyncableRecord = { ...incomingData, ...existingRecord }
        syncableRecord.version = existingRecord.version;
        await this.opts.storage.updateRecord(table, recordId, syncableRecord);
        this.opts.emitter.emitRemoteApplied(table, operation, recordId);
      }
    }
  }

  // ─── Pull missing events ───────────────────────────────────────────

  protected async pullMissingEvents(from: number, to: number): Promise<SyncEvent[]> {
    this.send({
      type: 'pull_request',
      deviceId: this.opts.deviceId,
      since: new Date(),
    } as any);
    return [];
  }

  // ─── Reorder buffer integration ────────────────────────────────────

  private handleEventThroughBuffer(event: SyncEvent): void {
    this.reorderBuffer.onEvent(event);
  }

  // ─── Batched ACKs ─────────────────────────────────────────────────

  private enqueueAck(eventId: string): void {
    this.pendingAckIds.push(eventId);
    if (!this.ackTimer) {
      this.ackTimer = setTimeout(() => this.flushAcks(), 100);
    }
  }

  private flushAcks(): void {
    this.ackTimer = null;
    if (this.pendingAckIds.length === 0) return;

    const eventIds = this.pendingAckIds.splice(0);
    this.send({
      type: 'event_ack',
      deviceId: this.opts.deviceId,
      eventIds,
    });
  }

  private cancelAckTimer(): void {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
  }

  // ─── State management ──────────────────────────────────────────────

  private setState(state: SyncClientState): void {
    if (this._state === state) return;
    this._state = state;
    this.onStateChange?.(state);
  }
}
