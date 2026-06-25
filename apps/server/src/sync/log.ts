import type { Request } from 'express';
import { syncHandler } from './setup.js';

export function getDeviceId(req: Request): string {
  return (req.headers['x-device-id'] as string) || (req.query.deviceId as string) || 'unknown';
}

export async function logChange(
  req: Request,
  table: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
  payload?: unknown
): Promise<void> {
  const deviceId = getDeviceId(req);
  try {
    const event = await syncHandler.createSyncEvent(table, operation, recordId, payload, deviceId);
    syncHandler.broadcast(event, deviceId);
  } catch (err) {
    console.error(`[sync] Failed to log change for ${table}/${recordId}:`, err);
  }
}
