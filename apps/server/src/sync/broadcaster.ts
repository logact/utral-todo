import type { Response } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and, isNotNull, gt, lt } from 'drizzle-orm';
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
  const events = await db
    .select()
    .from(schema.syncEvent)
    .where(gt(schema.syncEvent.createdAt, since))
    .orderBy(schema.syncEvent.createdAt);
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
  const event = (await db
    .insert(schema.syncEvent)
    .values({
      table,
      operation,
      recordId,
      payload: payload ? JSON.stringify(payload) : null,
      deviceId,
    })
    .returning())[0];
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

function sanitizeForDb(data: Record<string, unknown>): Record<string, unknown> {
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
        const existing = (await db.select().from(schema.todo).where(eq(schema.todo.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.todo)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.todo.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        return 'skipped';
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.todo).where(eq(schema.todo.id, recordId)).limit(1))[0];
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
          await db.update(schema.todo).set(sanitizeForDb(data)).where(eq(schema.todo.id, recordId));
        } else {
          await db.insert(schema.todo).values(sanitizeForDb(data) as never);
        }
      }
      break;
    }
    case 'todoRelation': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.todoRelation).where(eq(schema.todoRelation.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.todoRelation)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.todoRelation.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        if (existing) {
          try {
            await db.delete(schema.todoRelation).where(eq(schema.todoRelation.id, recordId));
          } catch (err) {
            console.error(`[sync] Failed to delete todoRelation ${recordId}:`, err);
          }
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.todoRelation).where(eq(schema.todoRelation.id, recordId)).limit(1))[0];
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
          await db.update(schema.todoRelation).set(sanitizeForDb(data)).where(eq(schema.todoRelation.id, recordId));
        } else {
          const fromTodoId = data.fromTodoId as string;
          const toTodoId = data.toTodoId as string;
          if (fromTodoId && toTodoId) {
            const [fromRows, toRows] = await Promise.all([
              db.select().from(schema.todo).where(eq(schema.todo.id, fromTodoId)).limit(1),
              db.select().from(schema.todo).where(eq(schema.todo.id, toTodoId)).limit(1),
            ]);
            if (!fromRows[0] || !toRows[0]) {
              console.warn(`[sync] Skipping todoRelation ${recordId}: referenced todo missing`);
              return 'skipped';
            }
          }
          try {
            await db.insert(schema.todoRelation).values(sanitizeForDb(data) as never);
          } catch (err) {
            console.error(`[sync] Failed to create todoRelation ${recordId}:`, err);
          }
        }
      }
      break;
    }
    case 'todoLog': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.todoLog).where(eq(schema.todoLog.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.todoLog)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.todoLog.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        try {
          await db.delete(schema.todoLog).where(eq(schema.todoLog.id, recordId));
        } catch (err) {
          console.error(`[sync] Failed to delete todoLog ${recordId}:`, err);
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.todoLog).where(eq(schema.todoLog.id, recordId)).limit(1))[0];
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
          await db.update(schema.todoLog).set(sanitizeForDb(data)).where(eq(schema.todoLog.id, recordId));
        } else {
          await db.insert(schema.todoLog).values(sanitizeForDb(data) as never);
        }
      }
      break;
    }
    case 'actionEdge': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.actionEdge).where(eq(schema.actionEdge.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.actionEdge)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.actionEdge.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        try {
          await db.delete(schema.actionEdge).where(eq(schema.actionEdge.id, recordId));
        } catch (err) {
          console.error(`[sync] Failed to delete actionEdge ${recordId}:`, err);
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.actionEdge).where(eq(schema.actionEdge.id, recordId)).limit(1))[0];
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
          await db.update(schema.actionEdge).set(sanitizeForDb(data)).where(eq(schema.actionEdge.id, recordId));
        } else {
          const fromTodoId = data.fromTodoId as string;
          const toTodoId = data.toTodoId as string;
          if (fromTodoId && toTodoId) {
            const [fromRows, toRows] = await Promise.all([
              db.select().from(schema.todo).where(eq(schema.todo.id, fromTodoId)).limit(1),
              db.select().from(schema.todo).where(eq(schema.todo.id, toTodoId)).limit(1),
            ]);
            if (!fromRows[0] || !toRows[0]) {
              console.warn(`[sync] Skipping actionEdge ${recordId}: referenced todo missing`);
              return 'skipped';
            }
          }
          try {
            await db.insert(schema.actionEdge).values(sanitizeForDb(data) as never);
          } catch (err) {
            console.error(`[sync] Failed to create actionEdge ${recordId}:`, err);
          }
        }
      }
      break;
    }
    case 'pluse': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.pluse).where(eq(schema.pluse.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.pluse)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.pluse.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        try {
          await db.delete(schema.pluse).where(eq(schema.pluse.id, recordId));
        } catch (err) {
          console.error(`[sync] Failed to delete pluse ${recordId}:`, err);
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.pluse).where(eq(schema.pluse.id, recordId)).limit(1))[0];
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
          await db.update(schema.pluse).set(sanitizeForDb(data)).where(eq(schema.pluse.id, recordId));
        } else {
          await db.insert(schema.pluse).values(sanitizeForDb(data) as never);
        }
      }
      break;
    }
    case 'timerSession': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.timerSession).where(eq(schema.timerSession.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.timerSession)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.timerSession.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        try {
          await db.delete(schema.timerSession).where(eq(schema.timerSession.id, recordId));
        } catch (err) {
          console.error(`[sync] Failed to delete timerSession ${recordId}:`, err);
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.timerSession).where(eq(schema.timerSession.id, recordId)).limit(1))[0];
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
          await db.update(schema.timerSession).set(sanitizeForDb(data)).where(eq(schema.timerSession.id, recordId));
        } else {
          await db.insert(schema.timerSession).values(sanitizeForDb(data) as never);
        }
      }
      break;
    }
    case 'repeatOccurrence': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.repeatOccurrence).where(eq(schema.repeatOccurrence.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.repeatOccurrence)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.repeatOccurrence.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        try {
          await db.delete(schema.repeatOccurrence).where(eq(schema.repeatOccurrence.id, recordId));
        } catch (err) {
          console.error(`[sync] Failed to delete repeatOccurrence ${recordId}:`, err);
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.repeatOccurrence).where(eq(schema.repeatOccurrence.id, recordId)).limit(1))[0];
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
          await db.update(schema.repeatOccurrence).set(sanitizeForDb(data)).where(eq(schema.repeatOccurrence.id, recordId));
        } else {
          await db.insert(schema.repeatOccurrence).values(sanitizeForDb(data) as never);
        }
      }
      break;
    }
    case 'plan': {
      if (operation === 'delete') {
        const existing = (await db.select().from(schema.plan).where(eq(schema.plan.id, recordId)).limit(1))[0];
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
            await db
              .update(schema.plan)
              .set({
                deletedAtWall: remoteHLC.wall,
                deletedAtCounter: remoteHLC.counter,
                deletedAtNode: remoteHLC.node,
              })
              .where(eq(schema.plan.id, recordId));
            return 'deleted';
          }
          return 'skipped';
        }
        try {
          await db.delete(schema.plan).where(eq(schema.plan.id, recordId));
        } catch (err) {
          console.error(`[sync] Failed to delete plan ${recordId}:`, err);
        }
      } else {
        if (!data) return 'skipped';
        const existing = (await db.select().from(schema.plan).where(eq(schema.plan.id, recordId)).limit(1))[0];
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
          await db.update(schema.plan).set(sanitizeForDb(data)).where(eq(schema.plan.id, recordId));
        } else {
          await db.insert(schema.plan).values(sanitizeForDb(data) as never);
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
  const tables = [schema.todo, schema.todoRelation, schema.todoLog, schema.actionEdge, schema.pluse, schema.timerSession, schema.repeatOccurrence, schema.plan];
  let totalDeleted = 0;

  for (const tbl of tables) {
    const result = await db.delete(tbl).where(and(isNotNull(tbl.deletedAtWall), lt(tbl.updatedAt, cutoff)));
    totalDeleted += (result.rowCount ?? 0);
  }

  if (totalDeleted > 0) {
    console.log(`[sync] GC: removed ${totalDeleted} tombstones older than 30 days`);
  }
  return totalDeleted;
}
