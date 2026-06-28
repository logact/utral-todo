export interface HLCTimestamp {
  wall: number;
  counter: number;
  node: string;
}

export function newHLC(nodeId: string, wall?: number): HLCTimestamp {
  throw new Error('Not implemented');
}

export function mergeHLC(local: HLCTimestamp, remote: HLCTimestamp): HLCTimestamp {
  throw new Error('Not implemented');
}

export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): -1 | 0 | 1 {
  throw new Error('Not implemented');
}

export function maxHLC(...hlc: HLCTimestamp[]): HLCTimestamp {
  throw new Error('Not implemented');
}

export function hlcToDate(hlc: HLCTimestamp): Date {
  throw new Error('Not implemented');
}

export function dateToHLC(date: Date, nodeId: string): HLCTimestamp {
  throw new Error('Not implemented');
}

export function hlcToString(hlc: HLCTimestamp): string {
  throw new Error('Not implemented');
}

export function stringToHLC(s: string): HLCTimestamp {
  throw new Error('Not implemented');
}

export interface SyncEvent {
  id: string;
  seq: number;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;
  deviceId: string;
  createdAt: HLCTimestamp;
}
