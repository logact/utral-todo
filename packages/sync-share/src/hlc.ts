export interface HLCTimestamp {
  wall: number;
  counter: number;
  node: string;
}

export function newHLC(nodeId: string, wall?: number): HLCTimestamp {
  return {
    wall: wall ?? Date.now(),
    counter: 0,
    node: nodeId,
  };
}

export function mergeHLC(local: HLCTimestamp, remote: HLCTimestamp): HLCTimestamp {
  if (remote.wall > local.wall) {
    return { wall: remote.wall, counter: 0, node: remote.node };
  }
  if (remote.wall === local.wall) {
    return { wall: local.wall, counter: Math.max(local.counter, remote.counter) + 1, node: local.node };
  }
  return { wall: local.wall, counter: local.counter + 1, node: local.node };
}

export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): -1 | 0 | 1 {
  if (a.wall < b.wall) return -1;
  if (a.wall > b.wall) return 1;
  if (a.counter < b.counter) return -1;
  if (a.counter > b.counter) return 1;
  if (a.node < b.node) return -1;
  if (a.node > b.node) return 1;
  return 0;
}

export function maxHLC(...hlc: HLCTimestamp[]): HLCTimestamp {
  if (hlc.length === 0) {
    throw new Error('maxHLC requires at least one timestamp');
  }
  let max = hlc[0];
  for (let i = 1; i < hlc.length; i++) {
    if (compareHLC(hlc[i], max) > 0) {
      max = hlc[i];
    }
  }
  return max;
}

export function hlcToDate(hlc: HLCTimestamp): Date {
  return new Date(hlc.wall);
}

export function dateToHLC(date: Date, nodeId: string): HLCTimestamp {
  return {
    wall: date.getTime(),
    counter: 0,
    node: nodeId,
  };
}

export function hlcToString(hlc: HLCTimestamp): string {
  return `${hlc.wall}-${hlc.counter}-${hlc.node}`;
}

export function stringToHLC(s: string): HLCTimestamp {
  const lastDash = s.lastIndexOf('-');
  const secondLastDash = s.lastIndexOf('-', lastDash - 1);
  
  if (lastDash === -1 || secondLastDash === -1) {
    throw new Error('Invalid HLC string format');
  }
  
  const wall = parseInt(s.slice(0, secondLastDash), 10);
  const counter = parseInt(s.slice(secondLastDash + 1, lastDash), 10);
  const node = s.slice(lastDash + 1);
  
  if (isNaN(wall) || isNaN(counter)) {
    throw new Error('Invalid HLC string format');
  }
  
  return { wall, counter, node };
}

export interface SyncEvent {
  id: string;
  seq: number;
  table: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload?: unknown;
  deviceId: string;
  createdAt: HLCTimestamp;
  /**
   * Routing channel key ("userId:channel") the event belongs to. `seq` is
   * monotonic *within* a channel, so a channel is required to interpret it.
   * Optional on the type only for legacy/test event literals; the server always
   * stamps it in acceptPush.
   */
  channel?: string;
}
