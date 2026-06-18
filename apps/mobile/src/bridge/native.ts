export interface NativeBridgeInfo {
  isNative: boolean;
  platform: string;
  version: string;
}

interface BridgeWindow extends Window {
  __bridge__?: {
    isNative: boolean;
    platform: string;
    version: string;
    call: (module: string, action: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
}

function getBridge() {
  return (window as unknown as BridgeWindow).__bridge__;
}

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && !!getBridge()?.isNative;
}

export function getNativeInfo(): NativeBridgeInfo | null {
  const bridge = getBridge();
  if (!bridge?.isNative) return null;
  return {
    isNative: bridge.isNative,
    platform: bridge.platform,
    version: bridge.version,
  };
}

async function callNative<T = unknown>(
  module: string,
  action: string,
  params?: Record<string, unknown>
): Promise<T> {
  const bridge = getBridge();
  if (!bridge) {
    throw new Error('Native bridge not available');
  }
  return bridge.call(module, action, params) as Promise<T>;
}

export const nativeHaptic = {
  impact: (style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' = 'medium') =>
    callNative('haptic', 'impact', { style }),
  notification: (type: 'success' | 'warning' | 'error' = 'success') =>
    callNative('haptic', 'notification', { type }),
  selection: () => callNative('haptic', 'selection'),
};

export const nativeNotification = {
  requestPermission: () =>
    callNative<boolean>('notification', 'requestPermission'),
  schedule: (options: { id: string; title: string; body?: string; date: number }) =>
    callNative<boolean>('notification', 'schedule', options),
  cancel: (id: string) =>
    callNative<boolean>('notification', 'cancel', { id }),
  cancelAll: () => callNative<boolean>('notification', 'cancelAll'),
};

export interface DeviceInfo {
  platform: string;
  model: string;
  systemName: string;
  systemVersion: string;
  name: string;
  deviceId: string;
  pushToken: string | null;
  isPad: boolean;
  isDarkMode: boolean;
}

export const nativeDevice = {
  getInfo: () => callNative<DeviceInfo>('device', 'getInfo'),
  getPushToken: () => callNative<string | null>('device', 'getPushToken'),
};

export const nativeStorage = {
  getItem: (key: string) =>
    callNative<string | null>('storage', 'getItem', { key }),
  setItem: (key: string, value: string) =>
    callNative<boolean>('storage', 'setItem', { key, value }),
  removeItem: (key: string) =>
    callNative<boolean>('storage', 'removeItem', { key }),
  clearAllData: () => callNative<boolean>('storage', 'clearAllData'),
};
