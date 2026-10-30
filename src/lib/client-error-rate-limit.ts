/**
 * Per-instance limiter for the unauthenticated reportClientError endpoint.
 *
 * Browser crash reports are public by design, so one connection must not be
 * able to flood error_events (and the Sentry forwarder) with junk rows. Keyed
 * by the edge-reported client IP only; X-Forwarded-For can be spoofed before
 * the edge and is ignored. Same sliding-window shape as the preview beacon
 * limiter in preview-telemetry.server.ts. Best-effort per isolate: it bounds
 * a flood cheaply without a database query per report.
 */
export const CLIENT_ERROR_RATE_LIMIT = 30;
export const CLIENT_ERROR_RATE_WINDOW_MS = 60_000;

const recent = new Map<string, number[]>();

export function clientErrorIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || headers.get("true-client-ip")?.trim() || "unknown";
}

export function clientErrorRateLimited(key: string, now = Date.now()): boolean {
  const since = now - CLIENT_ERROR_RATE_WINDOW_MS;
  const hits = (recent.get(key) ?? []).filter((at) => at > since);
  if (hits.length >= CLIENT_ERROR_RATE_LIMIT) {
    recent.set(key, hits);
    return true;
  }
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5_000) {
    for (const [entry, times] of recent) if (!times.some((at) => at > since)) recent.delete(entry);
  }
  return false;
}

/** Test hook: clears the per-instance limiter. */
export function resetClientErrorRateLimit() {
  recent.clear();
}
