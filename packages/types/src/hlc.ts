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
  if (local.wall > remote.wall) {
    return { wall: local.wall, counter: local.counter + 1, node: local.node };
  }
  if (local.wall < remote.wall) {
    return { wall: remote.wall, counter: remote.counter + 1, node: remote.node };
  }
  return {
    wall: local.wall,
    counter: Math.max(local.counter, remote.counter) + 1,
    node: local.node > remote.node ? local.node : remote.node,
  };
}

export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): -1 | 0 | 1 {
  if (a.wall !== b.wall) return a.wall < b.wall ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.node !== b.node) return a.node < b.node ? -1 : 1;
  return 0;
}

export function maxHLC(...hlc: HLCTimestamp[]): HLCTimestamp {
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
  return { wall: date.getTime(), counter: 0, node: nodeId };
}

export function hlcToString(hlc: HLCTimestamp): string {
  return `${hlc.wall}:${hlc.counter}:${hlc.node}`;
}

export function stringToHLC(s: string): HLCTimestamp {
  const [wall, counter, node] = s.split(':');
  return { wall: Number(wall), counter: Number(counter), node };
}
