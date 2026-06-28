import { db } from './drizzle-adapter';
import { hlcState } from './schema';
import { eq } from 'drizzle-orm';

interface NativeBridge {
  platform?: string;
  call: (module: string, action: string, params?: Record<string, unknown>) => Promise<unknown>;
}

function getBridge(): NativeBridge | undefined {
  return (window as unknown as Record<string, unknown>).__bridge__ as NativeBridge | undefined;
}

export async function initIOSSync(): Promise<void> {
  const bridge = getBridge();
  if (bridge?.platform !== 'ios') return;

  // Wait for bridge to be fully ready
  if (!bridge.call) {
    await new Promise<void>((resolve) => {
      const onReady = () => {
        window.removeEventListener('nativebridgeReady', onReady);
        resolve();
      };
      window.addEventListener('nativebridgeReady', onReady);
      // Timeout in case event already fired
      setTimeout(resolve, 500);
    });
  }

  // Get native deviceId and store it so syncEngine uses the same ID
  try {
    const nativeDeviceId = await bridge.call('sync', 'getDeviceId') as string;
    const rows = await db.select().from(hlcState).where(eq(hlcState.key, 'deviceId'));
    const existing = rows[0];
    if (!existing?.value) {
      await db.insert(hlcState).values({ key: 'deviceId', value: nativeDeviceId })
        .onConflictDoUpdate({ target: hlcState.key, set: { value: nativeDeviceId } });
    }
  } catch (err) {
    console.error('[iosSync] Failed to get native deviceId:', err);
  }

  // Mirror sync config from native storage to localStorage
  try {
    const config = await bridge.call('sync', 'getSyncConfig') as {
      serverUrl?: string;
      apiToken?: string;
    } | null;
    if (config?.serverUrl) {
      localStorage.setItem('syncServerUrl', config.serverUrl);
      if (config.apiToken) {
        localStorage.setItem('syncApiToken', config.apiToken);
      }
    }
  } catch (err) {
    console.error('[iosSync] Failed to get native sync config:', err);
  }

  // Register this device with the server (push token + deviceId)
  try {
    await bridge.call('sync', 'registerDevice');
  } catch (err) {
    console.error('[iosSync] Failed to register device:', err);
  }
}

export function isIOSShell(): boolean {
  const bridge = getBridge();
  return bridge?.platform === 'ios';
}
