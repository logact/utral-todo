import { db, schema } from '../db/index.js';
import { isNotNull, ne, and, inArray } from 'drizzle-orm';
import { sendNotifications, isApnsConfigured, type ApnsNotification } from './client.js';

export interface LiveActivityUpdatePayload {
  sessionId: string;
  contentState: Record<string, unknown>;
  dismissalSeconds?: number;
}

async function getLiveActivityDevices(excludeDeviceId?: string) {
  const conditions = [
    isNotNull(schema.device.pushToken),
    inArray(schema.device.platform, ['ios', 'watchos']),
  ];
  if (excludeDeviceId) {
    conditions.push(ne(schema.device.deviceId, excludeDeviceId));
  }
  return db.select().from(schema.device).where(and(...conditions));
}

export async function sendLiveActivityPush(
  payload: LiveActivityUpdatePayload,
  excludeDeviceId?: string
): Promise<void> {
  if (!isApnsConfigured()) return;

  try {
    const devices = await getLiveActivityDevices(excludeDeviceId);

    if (devices.length === 0) return;

    const apnsPayload = {
      aps: {
        'content-available': 1,
        'relevance-score': 1.0,
        timestamp: Math.floor(Date.now() / 1000),
      },
      type: 'liveActivityUpdate',
      sessionId: payload.sessionId,
      contentState: payload.contentState,
    };

    const notifications: ApnsNotification[] = devices.map((d) => ({
      deviceToken: d.pushToken!,
      payload: apnsPayload,
      priority: 10,
      pushType: 'liveactivity',
      apnsCollapseId: `timer-${payload.sessionId}`,
    }));

    await sendNotifications(notifications);
  } catch (err) {
    console.error('[apns] Live activity push error:', err);
  }
}

export async function sendLiveActivityEnd(
  sessionId: string,
  isCompleted: boolean,
  excludeDeviceId?: string
): Promise<void> {
  if (!isApnsConfigured()) return;

  try {
    const devices = await getLiveActivityDevices(excludeDeviceId);

    if (devices.length === 0) return;

    const apnsPayload = {
      aps: {
        'content-available': 1,
        timestamp: Math.floor(Date.now() / 1000),
      },
      type: 'liveActivityEnd',
      sessionId,
      isCompleted,
    };

    const notifications: ApnsNotification[] = devices.map((d) => ({
      deviceToken: d.pushToken!,
      payload: apnsPayload,
      priority: 10,
      pushType: 'liveactivity',
      apnsCollapseId: `timer-${sessionId}`,
    }));

    await sendNotifications(notifications);
  } catch (err) {
    console.error('[apns] Live activity end push error:', err);
  }
}
