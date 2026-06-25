import type { HLCTimestamp, SyncEvent } from '@utral/types';
import type { ServerSyncStorage, SyncableRecord } from '../core/types.js';

interface PrismaModel {
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

interface SyncEventModel {
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface PrismaClient {
  [model: string]: unknown;
  syncEvent: SyncEventModel;
}

function toNum(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : (v as number) ?? 0;
}

function isHLCTimestamp(val: unknown): val is { wall: number; counter: number; node: string } {
  return typeof val === 'object' && val !== null && 'wall' in val && 'counter' in val && 'node' in val;
}

function sanitizeForPrisma(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) continue;
    if (isHLCTimestamp(val)) {
      result[key] = new Date(val.wall);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/** Map from canonical table names to Prisma model names */
const TABLE_TO_MODEL: Record<string, string> = {
  todo: 'todo',
  todoRelation: 'todoRelation',
  todoLog: 'todoLog',
  actionEdge: 'actionEdge',
  pluse: 'pluse',
  timerSession: 'timerSession',
  repeatOccurrence: 'repeatOccurrence',
  plan: 'plan',
};

export class PrismaSyncStorage implements ServerSyncStorage {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private getModel(table: string): PrismaModel | undefined {
    const modelName = TABLE_TO_MODEL[table] ?? table;
    return this.prisma[modelName] as PrismaModel | undefined;
  }

  async getRecord(table: string, id: string): Promise<SyncableRecord | undefined> {
    const model = this.getModel(table);
    if (!model) return undefined;
    const row = await model.findUnique({ where: { id } });
    if (!row) return undefined;
    return this.rowToSyncable(row);
  }

  async createRecord(table: string, record: SyncableRecord): Promise<void> {
    const model = this.getModel(table);
    if (!model) return;
    await model.create({ data: sanitizeForPrisma(record as Record<string, unknown>) });
  }

  async updateRecord(table: string, id: string, changes: Partial<SyncableRecord>): Promise<void> {
    const model = this.getModel(table);
    if (!model) return;
    await model.update({ where: { id }, data: sanitizeForPrisma(changes as Record<string, unknown>) });
  }

  async softDelete(table: string, id: string, deletedAt: HLCTimestamp): Promise<void> {
    const model = this.getModel(table);
    if (!model) return;
    await model.update({
      where: { id },
      data: {
        deletedAtWall: deletedAt.wall,
        deletedAtCounter: deletedAt.counter,
        deletedAtNode: deletedAt.node,
      },
    });
  }

  async createSyncEvent(
    table: string,
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    payload: unknown,
    deviceId: string
  ): Promise<SyncEvent> {
    const event = await this.prisma.syncEvent.create({
      data: {
        table,
        operation,
        recordId,
        payload: payload ? JSON.stringify(payload) : undefined,
        deviceId,
      },
    });
    return {
      ...event,
      operation: event.operation as SyncEvent['operation'],
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
      createdAt: { wall: (event.createdAt as Date).getTime(), counter: 0, node: deviceId },
    } as SyncEvent;
  }

  async getEventsSince(since: Date): Promise<SyncEvent[]> {
    const events = await this.prisma.syncEvent.findMany({
      where: { createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
    });
    return events.map((e) => ({
      ...e,
      operation: e.operation as SyncEvent['operation'],
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
      createdAt: { wall: (e.createdAt as Date).getTime(), counter: toNum(e.versionCounter), node: (e.versionNode as string) || 'server' },
    })) as SyncEvent[];
  }

  async garbageCollectTombstones(ttlMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMs);
    let totalDeleted = 0;

    for (const table of Object.values(TABLE_TO_MODEL)) {
      const model = this.prisma[table] as PrismaModel | undefined;
      if (!model) continue;
      const result = await model.deleteMany({
        where: {
          deletedAtWall: { not: null },
          deletedAtCounter: { not: null },
          updatedAt: { lt: cutoff },
        },
      });
      totalDeleted += result.count;
    }

    if (totalDeleted > 0) {
      console.log(`[sync] GC: removed ${totalDeleted} tombstones older than ${ttlMs}ms`);
    }
    return totalDeleted;
  }

  private rowToSyncable(row: Record<string, unknown>): SyncableRecord {
    return {
      id: row.id as string,
      updatedAt: {
        wall: toNum(row.versionWall),
        counter: toNum(row.versionCounter),
        node: (row.versionNode as string) || '',
      },
      deletedAt: row.deletedAtWall != null ? {
        wall: toNum(row.deletedAtWall),
        counter: toNum(row.deletedAtCounter),
        node: (row.deletedAtNode as string) || '',
      } : undefined,
      ...row,
    };
  }
}
