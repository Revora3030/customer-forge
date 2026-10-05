/**
 * Small, dependency-free concurrency helpers.
 *
 * `mapConcurrent` runs async work over a list with at most `limit` tasks in
 * flight and returns results in input order. It never rejects because one
 * task failed — callers decide per item — unless the task itself throws, in
 * which case the error is surfaced after all in-flight work settles.
 *
 * `createBackoffGate` lets a pool of workers share rate-limit awareness: when
 * any worker hits a 429, every worker waits before its next provider call
 * instead of hammering the provider in parallel.
 */

export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;
  let firstError: { error: unknown } | null = null;

  async function lane() {
    while (firstError === null) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        firstError ??= { error };
      }
    }
  }

  await Promise.all(Array.from({ length: size }, () => lane()));
  if (firstError !== null) throw (firstError as { error: unknown }).error;
  return results;
}

export type BackoffGate = {
  /** Resolves once any shared backoff window has passed. */
  wait: () => Promise<void>;
  /** Opens (or extends) a shared backoff window for every worker. */
  trip: (ms: number) => void;
  /** Milliseconds until the gate reopens (0 when open). */
  remaining: () => number;
};

export function createBackoffGate(
  clock: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): BackoffGate {
  let openAt = 0;
  return {
    async wait() {
      // Loop: another worker may extend the window while we sleep.
      for (let delay = openAt - clock(); delay > 0; delay = openAt - clock()) await sleep(delay);
    },
    trip(ms: number) {
      openAt = Math.max(openAt, clock() + Math.max(0, ms));
    },
    remaining() {
      return Math.max(0, openAt - clock());
    },
  };
}
