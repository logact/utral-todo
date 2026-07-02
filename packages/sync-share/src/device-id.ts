/**
 * A device id is the stable identity a client uses both as its HLC node id (the
 * deterministic tie-breaker baked into every record it writes) and as its sync
 * connection `deviceId`. We give it a self-describing shape so an id read out of
 * a record or a log immediately tells you which kind of client produced it:
 *
 *   `${endType}-${uuid}`   e.g. "ios-3f2a1c9e-…", "desktop-8b0f…", "linux-…"
 *
 * The `endType` prefix is one of a small fixed set of client kinds; the UUID
 * suffix guarantees global uniqueness. Once generated it must be persisted and
 * never regenerated for an existing install — the node id is embedded in the HLC
 * version of records that device has already written.
 */
export type EndType = 'desktop' | 'ios' | 'android' | 'linux';

/**
 * Generate a v4 UUID using the best source available in the current runtime.
 * We cannot assume a global `crypto`: the Tauri webview and Node both provide
 * `crypto.randomUUID`, but React Native's Hermes engine has no `crypto` global
 * unless a polyfill is installed (this project ships none). So we degrade:
 *   1. `crypto.randomUUID()` when present (webview / Node);
 *   2. `crypto.getRandomValues()` to fill a v4 layout when only that exists;
 *   3. a `Math.random()`-based v4 as a last resort (Hermes).
 * A device id only needs to be unique per install, so the non-crypto fallback
 * is acceptable — it is never used as a security token.
 */
export function generateUUID(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Set the version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/**
 * Compose a device id from an end-type prefix and a UUID. The UUID defaults to a
 * freshly generated v4 UUID (see {@link generateUUID}) but can be supplied for
 * deterministic tests. Once generated it must be persisted and never
 * regenerated — the node id is embedded in the HLC version of records already
 * written by this device.
 */
export function makeDeviceId(endType: EndType, uuid: string = generateUUID()): string {
  return `${endType}-${uuid}`;
}

/** Extract the `endType` prefix from a device id, or `undefined` if unrecognized. */
export function getEndType(deviceId: string): EndType | undefined {
  const prefix = deviceId.split('-', 1)[0];
  return (['desktop', 'ios', 'android', 'linux'] as const).includes(prefix as EndType)
    ? (prefix as EndType)
    : undefined;
}
