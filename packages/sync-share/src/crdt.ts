import type { HLCTimestamp } from './hlc.js';

export interface CRDTRecord {
  id: string;
  version: HLCTimestamp;
  deletedAt?: HLCTimestamp;
  [key: string]: unknown;
}

export function hlcFromParts(_wall: number, _counter: number, _node: string): HLCTimestamp {
  throw new Error('Not implemented');
}

export function hlcToParts(_hlc: HLCTimestamp): { wall: number; counter: number; node: string } {
  throw new Error('Not implemented');
}

export function maxVersion(..._records: CRDTRecord[]): HLCTimestamp {
  throw new Error('Not implemented');
}

export function isDeleted(_record: CRDTRecord): boolean {
  throw new Error('Not implemented');
}

export function shouldAdoptRemote(_local: CRDTRecord | null, _remote: CRDTRecord): 'adopt' | 'skip' | 'delete' {
  throw new Error('Not implemented');
}

export function mergeRecords<T extends CRDTRecord>(_local: T | null, _remote: T): { merged: T; changed: boolean } {
  throw new Error('Not implemented');
}
