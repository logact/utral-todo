/**
 * ReorderBuffer - Ensures events are processed in sequential order.
 *
 * Maintains a fixed-size sliding window. When an event arrives, it is placed
 * at position `event.seq - nextSeq` in the window. On each insertion we flush
 * from the window start, popping consecutive events until a null slot is hit,
 * then the window slides right by the number of flushed events.
 */

export interface ReorderEvent {
  seq: number;
}

export interface ReorderBufferConfig {
  /** Maximum number of events the window can hold (look-ahead depth). */
  maxSize: number;
  /** Pull missing events when buffer reaches this size (gap exists). */
  thresholdSize: number;
  /** Pull missing events when oldest cached event exceeds this time (ms). */
  thresholdTime: number;
}

export interface ReorderBufferCallbacks<T extends ReorderEvent> {
  /** Called when an event is ready to be processed (in order). */
  onReady: (event: T) => void;
  /** Request missing events from the server for the given sequence range. */
  pullMissing: (from: number, to: number) => Promise<T[]>;
}

export class ReorderBuffer<T extends ReorderEvent> {
  /** Sliding window: slots [0..maxSize-1], null = not yet received */
  private window: (T | null)[];
  /** Next expected sequence number (left edge of the window) */
  private nextSeq: number;
  /** Timestamps for pull-threshold checks, keyed by seq */
  private cachedAt = new Map<number, number>();

  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pulling = false;
  private config: ReorderBufferConfig;
  private callbacks: ReorderBufferCallbacks<T>;

  constructor(
    config: ReorderBufferConfig,
    callbacks: ReorderBufferCallbacks<T>,
    startSeq = 0
  ) {
    this.config = config;
    this.callbacks = callbacks;
    this.nextSeq = startSeq;
    this.window = new Array<T | null>(config.maxSize).fill(null);
  }

  get pendingCount(): number {
    return this.window.filter((s) => s !== null).length;
  }

  /**
   * Handle an incoming event.
   * - Ignores duplicates (seq < nextSeq).
   * - Places event at offset in the window, then flushes from the front.
   * - If flush is blocked by a gap, checks pull thresholds.
   */
  onEvent(event: T): void {
    if (event.seq < this.nextSeq) return;

    const offset = event.seq - this.nextSeq;
    if (offset >= this.config.maxSize) {
      console.warn(`Event seq ${event.seq} exceeds max window size. Ignoring.`);
      return;
    }

    this.window[offset] = event;
    this.cachedAt.set(event.seq, Date.now());

    this.flush();

    if (this.pendingCount === 0) {
      this.cancelTimeout();
    } else {
      this.checkAndPull(event.seq);
    }
  }

  /**
   * Flush consecutive events from the window front.
   * Pop events from slot 0 upward until a null slot is hit.
   * Then shift the window left by the number of flushed events.
   */
  private flush(): void {
    let flushed = 0;
    while (flushed < this.window.length && this.window[flushed] !== null) {
      const event = this.window[flushed]!;
      this.callbacks.onReady(event);
      this.cachedAt.delete(event.seq);
      flushed++;
    }

    if (flushed === 0) return;

    // Slide the window: remove flushed entries, append empty slots
    this.window.splice(0, flushed);
    for (let i = 0; i < flushed; i++) {
      this.window.push(null);
    }

    // Advance the left edge of the window
    this.nextSeq += flushed;
  }

  /**
   * Check pull thresholds and request missing events if needed.
   */
  private checkAndPull(latestSeq: number): void {
    if (this.pulling) return;

    if (this.pendingCount >= this.config.thresholdSize) {
      this.pullMissingEvents(this.nextSeq, latestSeq);
      return;
    }

    const oldest = this.cachedAt.get(this.nextSeq);
    if (oldest && Date.now() - oldest > this.config.thresholdTime) {
      this.pullMissingEvents(this.nextSeq, latestSeq + this.config.maxSize);
      return;
    }

    this.scheduleTimeoutCheck();
  }

  private scheduleTimeoutCheck(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.pendingCount === 0) return;

    this.timeoutTimer = setTimeout(() => {
      this.checkTimeouts();
    }, this.config.thresholdTime);
  }

  private cancelTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private checkTimeouts(): void {
    if (this.pulling || this.pendingCount === 0) return;

    const oldest = this.cachedAt.get(this.nextSeq);
    if (oldest && Date.now() - oldest > this.config.thresholdTime) {
      const maxSeq = this.nextSeq + this.window.length;
      this.pullMissingEvents(this.nextSeq, maxSeq + this.config.maxSize);
      return;
    }

    this.scheduleTimeoutCheck();
  }

  private async pullMissingEvents(from: number, to: number): Promise<void> {
    this.pulling = true;
    try {
      const events = await this.callbacks.pullMissing(from, to);
      for (const event of events) {
        this.onEvent(event);
      }
    } finally {
      this.pulling = false;
    }
  }

  reset(startSeq?: number): void {
    this.window.fill(null);
    this.cachedAt.clear();
    if (startSeq !== undefined) this.nextSeq = startSeq;
    this.cancelTimeout();
  }
}
