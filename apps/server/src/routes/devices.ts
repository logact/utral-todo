import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const router = Router();

// POST /api/devices/register — Register or update a device
router.post('/register', async (req, res) => {
  const { deviceId, platform, name, pushToken, appVersion } = req.body;

  if (!deviceId || !platform) {
    return res.status(400).json({ error: 'deviceId and platform are required' });
  }

  const validPlatforms = ['ios', 'watchos', 'desktop'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${validPlatforms.join(', ')}` });
  }

  try {
    const [device] = await db.insert(schema.device).values({
      deviceId,
      platform,
      name: name ?? null,
      pushToken: pushToken ?? null,
      appVersion: appVersion ?? null,
    }).onConflictDoUpdate({
      target: schema.device.deviceId,
      set: {
        platform,
        name: name ?? null,
        pushToken: pushToken ?? null,
        appVersion: appVersion ?? null,
      },
    }).returning();
    res.status(201).json(device);
  } catch (err) {
    console.error('Device registration error:', err);
    res.status(500).json({ error: 'Failed to register device', details: String(err) });
  }
});

// GET /api/devices — List all registered devices
router.get('/', async (_req, res) => {
  try {
    const devices = await db.select().from(schema.device).orderBy(desc(schema.device.lastSeenAt));
    res.json(devices);
  } catch (err) {
    console.error('List devices error:', err);
    res.status(500).json({ error: 'Failed to list devices', details: String(err) });
  }
});

// DELETE /api/devices/:deviceId — Unregister a device
router.delete('/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    await db.delete(schema.device).where(eq(schema.device.deviceId, deviceId));
    res.status(204).send();
  } catch (err) {
    console.error('Delete device error:', err);
    res.status(500).json({ error: 'Failed to delete device', details: String(err) });
  }
});

// PATCH /api/devices/:deviceId — Update device info (e.g. push token refresh)
router.patch('/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const { name, pushToken, appVersion } = req.body;

  try {
    const [existing] = await db.select().from(schema.device).where(eq(schema.device.deviceId, deviceId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const [device] = await db.update(schema.device).set({
      name: name !== undefined ? (name ?? null) : undefined,
      pushToken: pushToken !== undefined ? (pushToken ?? null) : undefined,
      appVersion: appVersion !== undefined ? (appVersion ?? null) : undefined,
    }).where(eq(schema.device.deviceId, deviceId)).returning();
    res.json(device);
  } catch (err) {
    console.error('Update device error:', err);
    res.status(500).json({ error: 'Failed to update device', details: String(err) });
  }
});

export default router;
