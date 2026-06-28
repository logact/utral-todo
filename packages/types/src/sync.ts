import type { DevicePlatform } from './enums.js';

export interface SyncConfig {
  serverUrl: string;
  apiToken?: string;
  remoteOpsEnabled?: boolean;
}

export interface SyncResult {
  success: boolean;
  pulled: {
    todos: number;
    relations: number;
    todoLogs: number;
    actionEdges: number;
    plans: number;
    pluses: number;
    labels: number;
  };
  pushed: {
    todos: number;
    relations: number;
    todoLogs: number;
    actionEdges: number;
    plans: number;
    pluses: number;
    labels: number;
  };
  error?: string;
}

export interface Device {
  id: string;
  deviceId: string;
  platform: DevicePlatform;
  name?: string;
  pushToken?: string;
  appVersion?: string;
  lastSeenAt: Date;
  createdAt: Date;
}
