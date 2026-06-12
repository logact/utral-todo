let jsonMode = false;
let quietMode = false;

export function setJsonMode(enabled: boolean) {
  jsonMode = enabled;
}

export function setQuietMode(enabled: boolean) {
  quietMode = enabled;
}

export function out(data: unknown) {
  if (quietMode) return;
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === "string") {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

export function err(data: unknown) {
  if (jsonMode) {
    console.log(JSON.stringify({ error: data, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.error(data);
  }
}
