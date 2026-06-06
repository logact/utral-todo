import { prisma } from '../index.js';
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
    const devices = await prisma.device.findMany({
      where: {
        pushToken: { not: null },
        platform: { in: ['ios', 'watchos'] },
        ...(excludeDeviceId ? { deviceId: { not: excludeDeviceId } } : {}),
      },
    });

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
