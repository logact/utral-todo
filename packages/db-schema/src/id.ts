// ─────────────────────────────────────────────────────────────────────────────
// Shared ID generation helper for @utral/db-schema operation engines.
//
// Prefers crypto.randomUUID() when available (desktop/secure contexts) and
// falls back to a timestamp+random string for environments where crypto is not
// available (some React Native/Expo runtimes).
// ─────────────────────────────────────────────────────────────────────────────

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
