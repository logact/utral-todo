import type { HLCTimestamp } from './hlc.js';

export interface CRDTRecord {
  id: string;
  version: HLCTimestamp;
  deletedAt?: HLCTimestamp;
  [key: string]: unknown;
}

export function hlcFromParts(wall: number, counter: number, node: string): HLCTimestamp {
  throw new Error('Not implemented');
}

export function hlcToParts(hlc: HLCTimestamp): { wall: number; counter: number; node: string } {
  throw new Error('Not implemented');
}

export function maxVersion(...records: CRDTRecord[]): HLCTimestamp {
  throw new Error('Not implemented');
}

export function isDeleted(record: CRDTRecord): boolean {
  throw new Error('Not implemented');
}

export function shouldAdoptRemote(local: CRDTRecord | null, remote: CRDTRecord): 'adopt' | 'skip' | 'delete' {
  throw new Error('Not implemented');
}

export function mergeRecords<T extends CRDTRecord>(local: T | null, remote: T): { merged: T; changed: boolean } {
  throw new Error('Not implemented');
}
