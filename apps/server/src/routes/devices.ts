import { Router } from 'express';
import { prisma } from '../index.js';

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
    const device = await prisma.device.upsert({
      where: { deviceId },
      update: {
        platform,
        name: name ?? null,
        pushToken: pushToken ?? null,
        appVersion: appVersion ?? null,
      },
      create: {
        deviceId,
        platform,
        name: name ?? null,
        pushToken: pushToken ?? null,
        appVersion: appVersion ?? null,
      },
    });
    res.status(201).json(device);
  } catch (err) {
    console.error('Device registration error:', err);
    res.status(500).json({ error: 'Failed to register device', details: String(err) });
  }
});

// GET /api/devices — List all registered devices
router.get('/', async (_req, res) => {
  try {
    const devices = await prisma.device.findMany({ orderBy: { lastSeenAt: 'desc' } });
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
    await prisma.device.delete({ where: { deviceId } });
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
    const existing = await prisma.device.findUnique({ where: { deviceId } });
    if (!existing) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        name: name !== undefined ? (name ?? null) : undefined,
        pushToken: pushToken !== undefined ? (pushToken ?? null) : undefined,
        appVersion: appVersion !== undefined ? (appVersion ?? null) : undefined,
      },
    });
    res.json(device);
  } catch (err) {
    console.error('Update device error:', err);
    res.status(500).json({ error: 'Failed to update device', details: String(err) });
  }
});

export default router;
