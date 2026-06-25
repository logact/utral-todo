import { db, schema } from '../db/index.js';
import { isNotNull, ne, and, inArray } from 'drizzle-orm';
import { sendNotifications, isApnsConfigured, type ApnsNotification } from './client.js';

export interface SyncBroadcastPayload {
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
}

export async function broadcastToDevices(
  payload: SyncBroadcastPayload,
  excludeDeviceId?: string
): Promise<void> {
  if (!isApnsConfigured()) return;

  try {
    const conditions = [
      isNotNull(schema.device.pushToken),
      inArray(schema.device.platform, ['ios', 'watchos']),
    ];
    if (excludeDeviceId) {
      conditions.push(ne(schema.device.deviceId, excludeDeviceId));
    }

    const devices = await db.select().from(schema.device).where(and(...conditions));

    if (devices.length === 0) return;

    const apnsPayload = {
      aps: {
        'content-available': 1,
      },
      table: payload.table,
      operation: payload.operation,
      recordId: payload.recordId,
    };

    const notifications: ApnsNotification[] = devices.map((d) => ({
      deviceToken: d.pushToken!,
      payload: apnsPayload,
      priority: 5,
    }));

    await sendNotifications(notifications);
  } catch (err) {
    console.error('[apns] Broadcast error:', err);
  }
}
