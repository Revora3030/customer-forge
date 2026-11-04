/**
 * A soft, in-memory, per-isolate rate limiter (fixed window per key).
 *
 * "Soft" because each Worker isolate keeps its own counts, so it is a cheap
 * first line that sheds obvious floods before they cost a database call or a
 * Turnstile round-trip. The durable per-IP / per-contact limits stay in the
 * database (`register_public_submission_attempt`). Memory is bounded: the
 * oldest keys are evicted past `maxKeys`.
 */
export type SoftRateLimiter = {
  /** Records one hit; false when the key is over its limit for this window. */
  hit(key: string, now?: number): boolean;
  size(): number;
};

export function createSoftRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }): SoftRateLimiter {
  const { limit, windowMs } = options;
  const maxKeys = options.maxKeys ?? 5_000;
  const buckets = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket || now - bucket.start >= windowMs) {
        buckets.delete(key);
        bucket = { start: now, count: 0 };
      }
      bucket.count += 1;
      // Re-insert so Map order is "least recently hit first" for eviction.
      buckets.delete(key);
      buckets.set(key, bucket);
      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
      return bucket.count <= limit;
    },
    size: () => buckets.size,
  };
}

/**
 * Public lead forms: 20 submissions per IP per 10 minutes per isolate. Far
 * above any real visitor (the database gate answers a genuine repeat first),
 * so it only ever trips for scripted floods.
 */
export const publicLeadSoftLimiter = createSoftRateLimiter({ limit: 20, windowMs: 10 * 60_000 });
