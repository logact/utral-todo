/** Poll `predicate` until it returns truthy, or throw after `timeoutMs`. */
export async function waitFor<T>(
  predicate: () => T | undefined | null | false,
  { timeoutMs = 5000, intervalMs = 25, label = 'condition' }: {
    timeoutMs?: number;
    intervalMs?: number;
    label?: string;
  } = {},
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
