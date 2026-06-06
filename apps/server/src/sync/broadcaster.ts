import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../index.js';
import { broadcastToDevices } from '../apns/broadcast.js';

interface SyncEvent {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;
  deviceId: string;
  createdAt: Date;
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
  const data = `data: ${JSON.stringify({ type: 'event', event }) }\n\n`;
  for (const conn of connections) {
    if (excludeDeviceId && conn.deviceId === excludeDeviceId) continue;
    conn.res.write(data);
  }

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
  };
}

export async function applyChange(
  event: SyncEvent
): Promise<void> {
  const { table, operation, recordId, payload } = event;

  switch (table) {
    case 'todo': {
      if (operation === 'delete') {
        await prisma.todo.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.todo.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.todo.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.todo.create({ data: data as never });
        }
      }
      break;
    }
    case 'project': {
      if (operation === 'delete') {
        await prisma.project.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.project.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.project.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.project.create({ data: data as never });
        }
      }
      break;
    }
    case 'todoRelation': {
      if (operation === 'delete') {
        await prisma.todoRelation.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.todoRelation.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.todoRelation.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.todoRelation.create({ data: data as never });
        }
      }
      break;
    }
    case 'todoLog': {
      if (operation === 'delete') {
        await prisma.todoLog.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.todoLog.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.todoLog.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.todoLog.create({ data: data as never });
        }
      }
      break;
    }
    case 'roadmap': {
      if (operation === 'delete') {
        await prisma.roadmap.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.roadmap.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.roadmap.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.roadmap.create({ data: data as never });
        }
      }
      break;
    }
    case 'actionEdge': {
      if (operation === 'delete') {
        await prisma.actionEdge.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.actionEdge.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.actionEdge.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.actionEdge.create({ data: data as never });
        }
      }
      break;
    }
    case 'pluse': {
      if (operation === 'delete') {
        await prisma.pluse.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.pluse.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.pluse.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.pluse.create({ data: data as never });
        }
      }
      break;
    }
    case 'timerSession': {
      if (operation === 'delete') {
        await prisma.timerSession.delete({ where: { id: recordId } }).catch(() => {});
      } else {
        const data = payload as Record<string, unknown>;
        const existing = await prisma.timerSession.findUnique({ where: { id: recordId } });
        if (existing) {
          await prisma.timerSession.update({ where: { id: recordId }, data: data as never });
        } else {
          await prisma.timerSession.create({ data: data as never });
        }
      }
      break;
    }
  }
}
