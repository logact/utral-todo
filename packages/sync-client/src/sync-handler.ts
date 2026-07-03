import type {
  SyncEngineConfig,
  SyncWireMessage,
  SyncEvent,
  SyncableRecord,
  HLCTimestamp,
} from '@utral/sync-share';
import { compareHLC, generateUUID } from '@utral/sync-share';

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
  /** Optional bearer token appended as a `token` query param for WebSocket auth. */
  apiToken?: string;
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
          // The server echoes a client's own writes back so its seq stream stays
          // contiguous. Advance the buffer (this callback already does) and ack,
          // but don't re-apply our own event — the record is already local.
          const own = event.deviceId === this.opts.deviceId;
          console.log(
            `[sync] recv event seq=${event.seq} ${event.operation} ${event.table}/${event.recordId} from=${event.deviceId}${own ? ' (own echo)' : ''} dev=${this.opts.deviceId}`,
          );
          if (!own) {
            this.applyRemoteEvent(event);
          }
          // Record the highest contiguous seq we've processed so a
          // reconnect/restart resumes from here instead of replaying the
          // channel from seq 1. onReady fires for every in-order flush
          // (including our own echoes), so event.seq is exactly the last
          // contiguous seq applied.
          this.opts.storage.setLastSeq(event.seq);
        },
        pullMissing: (from, to) => this.pullMissingEvents(from, to),
      },
      // The server assigns per-channel seq starting at 1, so the buffer must
      // expect 1 first; a default of 0 would park the first event behind a
      // phantom seq-0 gap that never fills (the pull backfill path is a no-op).
      1
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
      // Resume the reorder buffer from the last seq we durably processed, so a
      // restart doesn't expect seq 1 again and stall behind a phantom gap. The
      // constructor seeds 1 for the first-ever connect.
      const lastSeq = await this.opts.storage.getLastSeq();
      this.reorderBuffer.reset(lastSeq != null ? lastSeq + 1 : 1);
      await this.openSocket();
      this.reconnectAttempts = 0;
      this.setState('connected');

      // Initial sync handshake, in order:
      //  1. Push any local writes that were queued while disconnected, so the
      //     server (and other devices) learn about them.
      //  2. Ask the server to replay everything we missed on this channel since
      //     the last seq we durably processed. The replayed events arrive as
      //     `event` messages and flow through the reorder buffer + applyRemoteEvent
      //     like any live event, so ordering/merge is unchanged.
      await this.flushQueue();
      await this.requestRemoteChanges(lastSeq);
    } catch (err) {
      this.setState('error');
      this.onError?.(err);
      this.scheduleReconnect();
    }
  }

  /** Gracefully disconnect. No auto-reconnect. */
  disconnect(): void {
    this.cancelReconnect();

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
  async syncLocalChange(table: string, operation: 'create' | 'update' | 'delete', recordId: string): Promise<void> {
    // Attach the full record as the payload so a receiving device can
    // materialize it even if it has never seen this record before.
    // `applyRemoteEvent` reads `event.payload` as the record to persist;
    // an empty payload would relay an envelope with no data.
    const record = await this.opts.storage.getRecord(table, recordId);
    await this.opts.storage.addToQueue({
      id: generateUUID(),
      table,
      operation,
      recordId,
      payload: record ?? {},
      createdAt: new Date(),
      retryCount: 0,
    });
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
      console.log("push-ack"+JSON.stringify(accepted));
      
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

  /**
   * Append the connection's routing identity to the server URL as query params.
   * The server reads `deviceId` / `userId` / `channel` from the URL at connection
   * time to subscribe the socket to its `(userId, channel)` channel and to tag the
   * origin device. Without these the server falls back to defaults and events are
   * broadcast to a channel nobody is subscribed to.
   */
  private buildConnectionUrl(): string {
    const params = new URLSearchParams({
      deviceId: this.opts.deviceId,
      userId: this.opts.userId,
      channel: this.opts.channel,
    });
    if (this.opts.apiToken) {
      params.set('token', this.opts.apiToken);
    }
    const paramsString = params.toString();
    const base = this.opts.serverUrl;
    return base + (base.includes('?') ? '&' : '?') + paramsString;
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.buildConnectionUrl();
      const safeUrl = url.replace(/token=[^&]*/, 'token=***');
      console.log(`[sync] connecting to ${safeUrl}`);

      const socket = this.opts.transport.connect(url);

      socket.onOpen(() => {
        console.log(`[sync] connected to ${safeUrl}`);
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
        console.error(`[sync] connection error for ${safeUrl}:`, err);
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
    debugger
    if (this._state !== 'connected') return;
    
    const items = await this.opts.storage.getQueueItems();
    if (items.length === 0) return;

    console.log(
      `[sync] push ${items.length} item(s) dev=${this.opts.deviceId} -> ${this.opts.userId}:${this.opts.channel}` +
        items.map((it) => ` [${it.operation} ${it.table}/${it.recordId}]`).join(''),
    );

    // The server routes a push by (userId, channel): its PushMessage.deviceId
    // field carries the userId, and channel is required. Sending the device id
    // here (and omitting channel) broadcasts to a channel nobody subscribed to,
    // so the event persists but never reaches other devices. The origin device
    // is still identified server-side from the connection, so it is correctly
    // excluded from the broadcast.
    this.send({
      type: 'push',
      deviceId: this.opts.userId,
      channel: this.opts.channel,
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

  /**
   * Ask the server to replay every event on this channel after the last seq we
   * durably processed. Called once per (re)connect. The replayed events come
   * back as ordinary `event` messages, so they pass through the reorder buffer
   * and applyRemoteEvent exactly like live events.
   */
  private async requestRemoteChanges(lastSeq?: number): Promise<void> {
    const seq = lastSeq ?? (await this.opts.storage.getLastSeq());
    const from = seq != null ? seq + 1 : 1;
    // Open-ended upper bound: we don't know the server's max seq, and the
    // server clamps to whatever exists.
    this.sendPullSeq(from, Number.MAX_SAFE_INTEGER);
  }

  protected async pullMissingEvents(from: number, to: number): Promise<SyncEvent[]> {
    // Backfill a gap the reorder buffer detected. The server replies with
    // `event` messages routed back through handleEventThroughBuffer, so we
    // don't return the events synchronously here — returning [] lets the buffer
    // keep waiting for them to arrive over the socket.
    this.sendPullSeq(from, to);
    return [];
  }

  /**
   * Send a `pull_seq` catch-up request. The server routes a pull by
   * (userId, channel): the message's `deviceId` field carries the userId and
   * `channel` is required — mirroring the push convention in flushQueue. The
   * requesting socket is identified server-side from the connection.
   */
  private sendPullSeq(from: number, to: number): void {
    console.log(`[sync] pull_seq from=${from} to=${to} dev=${this.opts.deviceId} -> ${this.opts.userId}:${this.opts.channel}`);
    this.send({
      type: 'pull_seq',
      deviceId: this.opts.userId,
      channel: this.opts.channel,
      from,
      to,
    } as any);
  }

  // ─── Reorder buffer integration ────────────────────────────────────

  private handleEventThroughBuffer(event: SyncEvent): void {
    this.reorderBuffer.onEvent(event);
  }

  // ─── Batched ACKs ─────────────────────────────────────────────────





  // ─── State management ──────────────────────────────────────────────

  private setState(state: SyncClientState): void {
    if (this._state === state) return;
    this._state = state;
    this.onStateChange?.(state);
  }
}
