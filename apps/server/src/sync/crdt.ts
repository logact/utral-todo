import type { HLCTimestamp } from '@utral/types';
import { compareHLC, maxHLC, newHLC } from '@utral/types';

export interface CRDTRecord {
  id: string;
  updatedAt: HLCTimestamp;
  deletedAt?: HLCTimestamp;
  [key: string]: unknown;
}

export function hlcFromParts(wall: number, counter: number, node: string): HLCTimestamp {
  return { wall, counter, node };
}

export function hlcToParts(hlc: HLCTimestamp): { wall: number; counter: number; node: string } {
  return { wall: hlc.wall, counter: hlc.counter, node: hlc.node };
}

export function maxUpdatedAt(...records: CRDTRecord[]): HLCTimestamp {
  const timestamps = records
    .filter((r) => r.updatedAt)
    .map((r) => r.updatedAt);
  if (timestamps.length === 0) return newHLC('epoch', 0);
  return maxHLC(...timestamps);
}

export function isDeleted(record: CRDTRecord): boolean {
  if (!record.deletedAt) return false;
  const maxUpdated = maxUpdatedAt(record);
  return compareHLC(record.deletedAt, maxUpdated) > 0;
}

export function shouldAdoptRemote(local: CRDTRecord | null, remote: CRDTRecord): 'adopt' | 'skip' | 'delete' {
  if (!local) return 'adopt';
  if (!remote) return 'skip';

  const localDeleted = isDeleted(local);
  const remoteDeleted = isDeleted(remote);

  if (remoteDeleted && !localDeleted) {
    if (remote.deletedAt && compareHLC(remote.deletedAt, local.updatedAt) > 0) {
      return 'delete';
    }
    return 'skip';
  }

  if (localDeleted && !remoteDeleted) {
    if (local.deletedAt && compareHLC(local.deletedAt, remote.updatedAt) > 0) {
      return 'skip';
    }
    return 'adopt';
  }

  if (remoteDeleted && localDeleted) {
    return 'skip';
  }

  const cmp = compareHLC(remote.updatedAt, local.updatedAt);
  if (cmp > 0) return 'adopt';
  if (cmp < 0) return 'skip';

  if (remote.updatedAt.node !== local.updatedAt.node) {
    return remote.updatedAt.node > local.updatedAt.node ? 'adopt' : 'skip';
  }

  return 'skip';
}

export function mergeRecords<T extends CRDTRecord>(local: T | null, remote: T): { merged: T; changed: boolean } {
  if (!local) return { merged: remote, changed: true };

  const decision = shouldAdoptRemote(local, remote);

  if (decision === 'adopt') {
    return { merged: remote, changed: true };
  }

  if (decision === 'delete') {
    return {
      merged: {
        ...local,
        deletedAt: remote.deletedAt,
        updatedAt: remote.updatedAt,
      } as T,
      changed: true,
    };
  }

  return { merged: local, changed: false };
}
