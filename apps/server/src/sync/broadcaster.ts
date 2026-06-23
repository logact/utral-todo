import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index.js';
import { broadcastToDevices } from '../apns/broadcast.js';
import type { HLCTimestamp } from '@utral/types';

function toNum(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : (v as number) ?? 0;
}

interface SyncEvent {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;
  deviceId: string;
  createdAt: HLCTimestamp;
}

interface Connection {
  res: Response;
  deviceId: string;
  keepAliveInterval: ReturnType<typeof setInterval>;
}

const connections = new Set<Connection>();

export function subscribe(deviceId: string, res: Response): void {
  const keepAliveInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);

  const conn: Connection = { res, deviceId, keepAliveInterval };
  connections.add(conn);

  res.on('close', () => {
    clearInterval(keepAliveInterval);
    connections.delete(conn);
  });
}

export function broadcast(event: SyncEvent, excludeDeviceId?: string): void {
  const data = `data: ${JSON.stringify({ type: 'event', event }, (_k, v) => typeof v === 'bigint' ? Number(v) : v) }\n\n`;
  let sent = 0;
  let skipped = 0;
  for (const conn of connections) {
    if (excludeDeviceId && conn.deviceId === excludeDeviceId) {
      skipped++;
      continue;
    }
    try {
      conn.res.write(data);
      sent++;
    } catch (err) {
      console.error('[sync] Failed to write to connection:', err);
    }
  }
  console.log(`[sync] Broadcast ${event.table}/${event.operation}/${event.recordId} to ${sent} clients (skipped ${skipped}, total ${connections.size})`);

  // Also send APNS silent push to iOS/watchOS devices
  broadcastToDevices(
    { table: event.table, operation: event.operation, recordId: event.recordId },
    excludeDeviceId
  ).catch(() => {});
}

export async function getEventsSince(since: Date): Promise<SyncEvent[]> {
  const events = await prisma.syncEvent.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: 'asc' },
  });
  return events.map((e) => ({
    ...e,
    operation: e.operation as SyncEvent['operation'],
    payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
    createdAt: { wall: e.createdAt.getTime(), counter: toNum(e.versionCounter), node: e.versionNode || 'server' },
  }));
}

export async function createSyncEvent(
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
  payload: unknown,
  deviceId: string
): Promise<SyncEvent> {
  const event = await prisma.syncEvent.create({
    data: {
      table,
      operation,
      recordId,
      payload: payload ? JSON.stringify(payload) : Prisma.JsonNull,
      deviceId,
    },
  });
  return {
    ...event,
    operation: event.operation as SyncEvent['operation'],
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
    createdAt: { wall: event.createdAt.getTime(), counter: 0, node: deviceId },
  };
}

export type ApplyResult = 'applied' | 'skipped' | 'deleted' | 'error';

import { shouldAdoptRemote, hlcFromParts } from './crdt.js';

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

export async function applyChange(
  event: SyncEvent
): Promise<ApplyResult> {
  const { table, operation, recordId, payload } = event;

  const data = payload as Record<string, unknown> | undefined;

  switch (table) {
    case 'todo': {
      if (operation === 'delete') {
        const existing = await prisma.todo.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data?.deletedAtWall as number) ?? 0,
            (data?.deletedAtCounter as number) ?? 0,
            (data?.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const remote: { updatedAt: ReturnType<typeof hlcFromParts>; deletedAt?: ReturnType<typeof hlcFromParts> } = {
            updatedAt: localHLC,
            deletedAt: remoteHLC,
          };
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.todo.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        return 'skipped';
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.todo.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.todo.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          await prisma.todo.create({ data: sanitizeForPrisma(data) as never });
        }
      }
      break;
    }
    case 'todoRelation': {
      if (operation === 'delete') {
        const existing = await prisma.todoRelation.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.todoRelation.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        if (existing) {
          await prisma.todoRelation.delete({ where: { id: recordId } }).catch((err) => {
            console.error(`[sync] Failed to delete todoRelation ${recordId}:`, err);
          });
        }
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.todoRelation.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.todoRelation.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          const fromTodoId = data.fromTodoId as string;
          const toTodoId = data.toTodoId as string;
          if (fromTodoId && toTodoId) {
            const [fromTodo, toTodo] = await Promise.all([
              prisma.todo.findUnique({ where: { id: fromTodoId } }),
              prisma.todo.findUnique({ where: { id: toTodoId } }),
            ]);
            if (!fromTodo || !toTodo) {
              console.warn(`[sync] Skipping todoRelation ${recordId}: referenced todo missing`);
              return 'skipped';
            }
          }
          await prisma.todoRelation.create({ data: sanitizeForPrisma(data) as never }).catch((err) => {
            console.error(`[sync] Failed to create todoRelation ${recordId}:`, err);
          });
        }
      }
      break;
    }
    case 'todoLog': {
      if (operation === 'delete') {
        const existing = await prisma.todoLog.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.todoLog.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        await prisma.todoLog.delete({ where: { id: recordId } }).catch((err) => {
          console.error(`[sync] Failed to delete todoLog ${recordId}:`, err);
        });
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.todoLog.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.todoLog.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          await prisma.todoLog.create({ data: sanitizeForPrisma(data) as never });
        }
      }
      break;
    }
    case 'actionEdge': {
      if (operation === 'delete') {
        const existing = await prisma.actionEdge.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.actionEdge.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        await prisma.actionEdge.delete({ where: { id: recordId } }).catch((err) => {
          console.error(`[sync] Failed to delete actionEdge ${recordId}:`, err);
        });
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.actionEdge.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.actionEdge.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          const fromTodoId = data.fromTodoId as string;
          const toTodoId = data.toTodoId as string;
          if (fromTodoId && toTodoId) {
            const [fromTodo, toTodo] = await Promise.all([
              prisma.todo.findUnique({ where: { id: fromTodoId } }),
              prisma.todo.findUnique({ where: { id: toTodoId } }),
            ]);
            if (!fromTodo || !toTodo) {
              console.warn(`[sync] Skipping actionEdge ${recordId}: referenced todo missing`);
              return 'skipped';
            }
          }
          await prisma.actionEdge.create({ data: sanitizeForPrisma(data) as never }).catch((err) => {
            console.error(`[sync] Failed to create actionEdge ${recordId}:`, err);
          });
        }
      }
      break;
    }
    case 'pluse': {
      if (operation === 'delete') {
        const existing = await prisma.pluse.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.pluse.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        await prisma.pluse.delete({ where: { id: recordId } }).catch((err) => {
          console.error(`[sync] Failed to delete pluse ${recordId}:`, err);
        });
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.pluse.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.pluse.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          await prisma.pluse.create({ data: sanitizeForPrisma(data) as never });
        }
      }
      break;
    }
    case 'timerSession': {
      if (operation === 'delete') {
        const existing = await prisma.timerSession.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.timerSession.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        await prisma.timerSession.delete({ where: { id: recordId } }).catch((err) => {
          console.error(`[sync] Failed to delete timerSession ${recordId}:`, err);
        });
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.timerSession.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.timerSession.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          await prisma.timerSession.create({ data: sanitizeForPrisma(data) as never });
        }
      }
      break;
    }
    case 'repeatOccurrence': {
      if (operation === 'delete') {
        const existing = await prisma.repeatOccurrence.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.repeatOccurrence.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        await prisma.repeatOccurrence.delete({ where: { id: recordId } }).catch((err) => {
          console.error(`[sync] Failed to delete repeatOccurrence ${recordId}:`, err);
        });
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.repeatOccurrence.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.repeatOccurrence.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          await prisma.repeatOccurrence.create({ data: sanitizeForPrisma(data) as never });
        }
      }
      break;
    }
    case 'plan': {
      if (operation === 'delete') {
        const existing = await prisma.plan.findUnique({ where: { id: recordId } });
        if (existing && data) {
          const remoteHLC = hlcFromParts(
            (data.deletedAtWall as number) ?? 0,
            (data.deletedAtCounter as number) ?? 0,
            (data.deletedAtNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: localHLC, deletedAt: remoteHLC },
          );
          if (decision === 'delete') {
            await prisma.plan.update({
              where: { id: recordId },
              data: {
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              },
            });
            return 'deleted';
          }
          return 'skipped';
        }
        await prisma.plan.delete({ where: { id: recordId } }).catch((err) => {
          console.error(`[sync] Failed to delete plan ${recordId}:`, err);
        });
      } else {
        if (!data) return 'skipped';
        const existing = await prisma.plan.findUnique({ where: { id: recordId } });
        if (existing) {
          const remoteHLC = hlcFromParts(
            (data.versionWall as number) ?? 0,
            (data.versionCounter as number) ?? 0,
            (data.versionNode as string) ?? event.deviceId,
          );
          const localHLC = hlcFromParts(toNum(existing.versionWall), toNum(existing.versionCounter), existing.versionNode);
          const decision = shouldAdoptRemote(
            { id: recordId, updatedAt: localHLC },
            { id: recordId, updatedAt: remoteHLC },
          );
          if (decision !== 'adopt') return 'skipped';
          await prisma.plan.update({ where: { id: recordId }, data: sanitizeForPrisma(data) as never });
        } else {
          await prisma.plan.create({ data: sanitizeForPrisma(data) as never });
        }
      }
      break;
    }
  }
  return 'applied';
}

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function garbageCollectTombstones(): Promise<number> {
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_MS);
  const tables = ['todo', 'todoRelation', 'todoLog', 'actionEdge', 'pluse', 'timerSession', 'repeatOccurrence', 'plan'] as const;
  let totalDeleted = 0;

  for (const table of tables) {
    const model = (prisma as unknown as Record<string, unknown>)[table] as {
      deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
    };
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
    console.log(`[sync] GC: removed ${totalDeleted} tombstones older than 30 days`);
  }
  return totalDeleted;
}
