/**
 * CAPACITY WAIT — owner-visible state for builds parked by the existing
 * capacity deferral (site-engine.worker.server.ts `capacityDeferral`).
 *
 * The deferral path is the only writer: it sets lease_expires_at = retryAt and
 * mirrors it into resumes_at / wait_reason / wait_providers. Nothing here
 * decides anything creative; it only summarises recorded AI call outcomes.
 */

export type CapacityCall = { ok: boolean | null; error_category: string | null; provider?: string | null };
export type ProviderRuntime = { provider: string; open_until: string | null; rate_limited_at?: string | null };
export type WaitProviders = { providers: string[]; earliestResetAt: string | null };

const PRESSURE = new Set(["rate_limited", "quota", "timeout"]);

/** Providers that hit rate limits/quotas/timeouts, and the earliest known reset. */
export function summarizeCapacityPressure(
  calls: CapacityCall[],
  runtime: ProviderRuntime[] = [],
  now = Date.now(),
): WaitProviders {
  const providers = [
    ...new Set(
      calls
        .filter((call) => call.ok === false && PRESSURE.has(call.error_category ?? "") && call.provider)
        .map((call) => String(call.provider)),
    ),
  ].sort();
  const resets = runtime
    .filter((row) => providers.includes(row.provider) && row.open_until)
    .map((row) => Date.parse(String(row.open_until)))
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b);
  return { providers, earliestResetAt: resets.length ? new Date(resets[0]).toISOString() : null };
}

export type CapacityWaitState = {
  resumesAt: string;
  reason: string;
  providers: string[];
  earliestResetAt: string | null;
};

type JobLike = {
  status?: string | null;
  resumes_at?: string | null;
  lease_expires_at?: string | null;
  wait_reason?: string | null;
  wait_providers?: unknown;
  failure_kind?: string | null;
  capacity_deferrals?: number | null;
};

/** Display data for a queued build waiting for AI capacity, else null. */
export function capacityWaitState(job: JobLike | null | undefined, now = Date.now()): CapacityWaitState | null {
  if (!job || job.status !== "queued") return null;
  const resumesAt = job.resumes_at ?? (Number(job.capacity_deferrals ?? 0) > 0 && job.failure_kind === "provider" ? job.lease_expires_at : null);
  if (!resumesAt) return null;
  const at = Date.parse(resumesAt);
  if (!Number.isFinite(at) || at <= now) return null;
  const raw = job.wait_providers && typeof job.wait_providers === "object" ? (job.wait_providers as Record<string, unknown>) : {};
  const providers = Array.isArray(raw["providers"]) ? (raw["providers"] as unknown[]).map(String) : [];
  const reset = typeof raw["earliestResetAt"] === "string" ? (raw["earliestResetAt"] as string) : null;
  return {
    resumesAt: new Date(at).toISOString(),
    reason: job.wait_reason || "The free AI team is at capacity right now.",
    providers,
    earliestResetAt: reset,
  };
}

/** "Waiting for AI capacity — resumes about 10:15" in the viewer's local time. */
export function capacityWaitHeadline(state: CapacityWaitState, locale?: string, timeZone?: string): string {
  const time = new Date(state.resumesAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone });
  return `Waiting for AI capacity — resumes about ${time}`;
}

export function capacityWaitDetail(state: CapacityWaitState, locale?: string, timeZone?: string): string {
  const parts = [state.reason];
  if (state.providers.length) parts.push(`Busy or out of quota: ${state.providers.slice(0, 6).join(", ")}${state.providers.length > 6 ? "…" : ""}.`);
  if (state.earliestResetAt)
    parts.push(
      `Earliest provider reset: about ${new Date(state.earliestResetAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone })}.`,
    );
  parts.push("Finished work is saved and reused.");
  return parts.join(" ");
}
