/**
 * Shared, durable free-AI usage and health state.
 *
 * The in-process budget counters and circuit breaker in `free.ts` /
 * `router.server.ts` protect ONE worker. Production runs many workers, so on
 * their own they let the same free daily allowance be spent several times over
 * and let every worker rediscover a dead provider independently.
 *
 * This module records the same facts in the database, where the counting is
 * atomic, so every worker sees one shared picture:
 *   - requests used against today's allowance, per provider
 *   - consecutive failures and the resting (circuit-open) window
 *   - last success, last failure, last latency, last rate-limit
 *
 * Rules kept deliberately strict:
 *   - Server-only; reached through the service-role client, never the browser.
 *   - Never blocks or breaks a model call: every database call is guarded and a
 *     failure degrades to the in-process state instead of throwing.
 *   - Holds no prompt text, no answer text and no credential — provider name,
 *     counters and timestamps only.
 *   - Cost-free: it records usage, it never authorises a paid call.
 */

import type { FreeProviderName } from "@/lib/ai/free";

export type DurableProviderRuntime = {
  provider: string;
  day: string;
  used: number;
  failures: number;
  openUntil: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastLatencyMs: number | null;
  rateLimitedAt: number | null;
};

const SNAPSHOT_TTL_MS = 15_000;

let snapshot: Map<string, DurableProviderRuntime> = new Map();
let snapshotAt = 0;
let inFlight: Promise<Map<string, DurableProviderRuntime>> | null = null;
let disabled = false;

function ms(value: unknown): number | null {
  if (typeof value !== "string" || value === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRuntime(row: Record<string, unknown>): DurableProviderRuntime {
  return {
    provider: String(row["provider"] ?? ""),
    day: String(row["day"] ?? ""),
    used: Number(row["used"] ?? 0) || 0,
    failures: Number(row["failures"] ?? 0) || 0,
    openUntil: ms(row["open_until"]),
    lastSuccessAt: ms(row["last_success_at"]),
    lastFailureAt: ms(row["last_failure_at"]),
    lastLatencyMs: row["last_latency_ms"] == null ? null : Number(row["last_latency_ms"]),
    rateLimitedAt: ms(row["rate_limited_at"]),
  };
}

async function admin() {
  if (disabled) return null;
  try {
    const mod = await import("@/integrations/supabase/client.server");
    return mod.supabaseAdmin ?? null;
  } catch {
    // No backend reachable in this runtime (unit tests, local tooling).
    disabled = true;
    return null;
  }
}

/**
 * Refresh the shared picture, at most once per TTL and once concurrently.
 * Returns the last known state when the database cannot be reached, so the
 * caller always has something to reason about.
 */
export async function refreshDurableRuntime(
  force = false,
): Promise<Map<string, DurableProviderRuntime>> {
  if (!force && Date.now() - snapshotAt < SNAPSHOT_TTL_MS) return snapshot;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const client = await admin();
      if (!client) return snapshot;
      const { data, error } = await client.rpc("ai_runtime_snapshot");
      if (error || !Array.isArray(data)) return snapshot;
      const next = new Map<string, DurableProviderRuntime>();
      for (const row of data as Record<string, unknown>[]) {
        const runtime = toRuntime(row);
        if (runtime.provider) next.set(runtime.provider, runtime);
      }
      snapshot = next;
      snapshotAt = Date.now();
      return snapshot;
    } catch {
      return snapshot;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** The shared state for one provider, from the last refresh. */
export function durableRuntimeFor(provider: string): DurableProviderRuntime | null {
  return snapshot.get(provider) ?? null;
}

/** Everything the last refresh knows — for the admin AI surface. */
export function durableRuntimeSnapshot(): DurableProviderRuntime[] {
  return [...snapshot.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}
/**
 * Is this provider resting according to the SHARED circuit state?
 * Unknown (never recorded, or database unreachable) means "not resting" — this
 * layer may only ever add caution on top of the local breaker, never remove it.
 */
export function durableProviderResting(provider: string): boolean {
  const state = snapshot.get(provider);
  return state?.openUntil != null && state.openUntil > Date.now();
}

/**
 * Requests left against today's shared allowance, or null when the provider
 * has no cap or nothing has been recorded yet.
 */
export function durableBudgetRemaining(provider: string, cap: number | null): number | null {
  if (cap === null || cap <= 0) return null;
  const state = snapshot.get(provider);
  if (!state) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) return cap;
  return Math.max(0, cap - state.used);
}

/** True only when the shared counters prove today's allowance is spent. */
export function durableBudgetExhausted(provider: string, cap: number | null): boolean {
  const remaining = durableBudgetRemaining(provider, cap);
  return remaining !== null && remaining <= 0;
}

/**
 * Count one free request against the shared allowance, atomically.
 * Returns the remaining requests when the provider has a cap.
 */
export async function noteDurableFreeUse(
  provider: FreeProviderName | string,
  cap: number | null,
): Promise<number | null> {
  try {
    const client = await admin();
    if (!client) return null;
    const { data, error } = await client.rpc("ai_note_free_use", {
      _provider: provider,
      ...(cap === null ? {} : { _cap: cap }),
    });
    if (error) return null;
    const remaining = typeof data === "number" ? data : null;
    const state = snapshot.get(String(provider));
    if (state) {
      const today = new Date().toISOString().slice(0, 10);
      state.used = state.day === today ? state.used + 1 : 1;
      state.day = today;
    }
    return remaining;
  } catch {
    return null;
  }
}

/**
 * Add the tokens one free answer used to a shared token counter (OpenAI's
 * shared-traffic allowance is metered in tokens, not requests). The counter
 * lives in the same runtime table under its own key, so durableBudgetExhausted
 * can check it against the token cap like any other allowance.
 */
export async function noteDurableFreeTokens(key: string, tokens: number): Promise<void> {
  const amount = Math.max(0, Math.floor(tokens));
  if (!amount) return;
  const today = new Date().toISOString().slice(0, 10);
  const state = snapshot.get(key);
  if (state) {
    state.used = state.day === today ? state.used + amount : amount;
    state.day = today;
  }
  try {
    const client = await admin();
    if (!client) return;
    await client.rpc("ai_note_free_tokens" as never, { _provider: key, _amount: amount } as never);
  } catch {
    // Never breaks a model call; the in-process counter still applies.
  }
}

/** Record one provider outcome in the shared circuit state. */
export async function noteDurableProviderResult(input: {
  provider: FreeProviderName | string;
  ok: boolean;
  latencyMs?: number | null;
  rateLimited?: boolean;
  failureThreshold?: number;
  cooldownSeconds?: number;
}): Promise<DurableProviderRuntime | null> {
  try {
    const client = await admin();
    if (!client) return null;
    const { data, error } = await client.rpc("ai_note_provider_result", {
      _provider: input.provider,
      _ok: input.ok,
      ...(input.latencyMs == null ? {} : { _latency_ms: input.latencyMs }),
      _rate_limited: input.rateLimited === true,
      _failure_threshold: input.failureThreshold ?? 3,
      _cooldown_seconds: input.cooldownSeconds ?? 60,
    });
    if (error || !data || typeof data !== "object") return null;
    const runtime = toRuntime(data as Record<string, unknown>);
    if (runtime.provider) snapshot.set(runtime.provider, runtime);
    return runtime;
  } catch {
    return null;
  }
}

/* ----------------------------- model-scoped rows ---------------------------- */

/**
 * One model's own record in the same runtime table. The provider column holds
 * at most 40 characters, so the model id is folded into a short stable hash:
 *   "mr:<provider>:<hash>"  — a short rest after repeated rate limits/timeouts
 *   "mx:<provider>:<hash>"  — a model the provider says does not exist (404)
 * Neither row benches the provider's other models.
 */
export type DurableModelRecord = "rest" | "gone";

function shortHash(value: string): string {
  // FNV-1a, 32 bit: stable across workers, no crypto dependency.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function durableModelKey(record: DurableModelRecord, provider: string, model: string): string {
  return `${record === "gone" ? "mx" : "mr"}:${provider.slice(0, 24)}:${shortHash(model)}`;
}

/** Consecutive model-missing answers before a model is skipped. */
export const MODEL_GONE_STRIKES = 3;
/** How long a model that keeps answering "no such model" is skipped. */
export const MODEL_GONE_REST_MS = 24 * 3600_000;
/** The database caps one rest at an hour; the 24h window is measured from it. */
const MODEL_GONE_DB_COOLDOWN_SECONDS = 3600;

/** True while this model rests on the shared model-scoped circuit. */
export function durableModelResting(provider: string, model: string, now = Date.now()): boolean {
  const rest = snapshot.get(durableModelKey("rest", provider, model));
  if (rest?.openUntil != null && rest.openUntil > now) return true;
  // A model-missing circuit opened within the last 24h with no success since
  // (a success clears open_until). Measured from the moment it opened, so the
  // database's one-hour cap on a single rest does not shorten it.
  const gone = snapshot.get(durableModelKey("gone", provider, model));
  return (
    gone?.openUntil != null &&
    gone.openUntil - MODEL_GONE_DB_COOLDOWN_SECONDS * 1000 + MODEL_GONE_REST_MS > now
  );
}

/** Record one model-scoped failure (rate limit/timeout rest, or model missing). */
export async function noteDurableModelFailure(input: {
  provider: string;
  model: string;
  record: DurableModelRecord;
  latencyMs?: number | null;
  rateLimited?: boolean;
}): Promise<DurableProviderRuntime | null> {
  return noteDurableProviderResult({
    provider: durableModelKey(input.record, input.provider, input.model),
    ok: false,
    latencyMs: input.latencyMs ?? null,
    rateLimited: input.rateLimited === true,
    ...(input.record === "gone"
      ? { failureThreshold: MODEL_GONE_STRIKES, cooldownSeconds: MODEL_GONE_DB_COOLDOWN_SECONDS }
      : {}),
  });
}

/**
 * A model answered: clear its model-scoped rows, but only where one is known to
 * hold a failure, so a normal answer costs no extra database write.
 */
export function noteDurableModelSuccess(provider: string, model: string): void {
  for (const record of ["rest", "gone"] as const) {
    const key = durableModelKey(record, provider, model);
    const state = snapshot.get(key);
    if (state && (state.failures > 0 || state.openUntil != null))
      void noteDurableProviderResult({ provider: key, ok: true });
  }
}

/* ------------------------------- paid accounts ------------------------------ */

/** Shared key for a PAID provider account's degraded (quota / key) state. */
export function durablePaidKey(provider: string): string {
  return `paid:${provider.slice(0, 32)}`;
}

/**
 * True while another worker (or this one) saw this paid account refuse for
 * quota or a rejected key, so every fresh worker also tries the free team first.
 */
export function durablePaidDegraded(provider: string, now = Date.now()): boolean {
  const state = snapshot.get(durablePaidKey(provider));
  return state?.openUntil != null && state.openUntil > now;
}

/** Test/operations helper: forget the cached shared picture. */
export function resetDurableRuntimeCache() {
  snapshot = new Map();
  snapshotAt = 0;
  inFlight = null;
  disabled = false;
}
