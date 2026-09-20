/**
 * REVORA CAPABILITY REGISTRY (runtime half). Server-only.
 *
 * Resolves a capability to an authorized provider, runs the call with a
 * timeout, records health / rate-limit / runtime-verification state, and fails
 * over to the next eligible provider. When nothing can serve the capability it
 * returns an honest unavailable result — it never throws into a builder path,
 * so a missing optional integration can never break the builder.
 *
 * Credentials are only ever *detected* here. No value is returned, logged or
 * put into a result.
 */

import {
  ALL_CAPABILITIES,
  CAPABILITY_LABELS,
  PROVIDERS,
  capabilityStatus,
  hasDeterministicPath,
  providersFor,
  selectProvider,
  type Capability,
  type CapabilitySnapshot,
  type ProviderDefinition,
  type ProviderSnapshot,
  type ProviderStatus,
} from "@/lib/integrations/capabilities";

type Health = {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
  rateLimitedUntil: number | null;
  consecutiveFailures: number;
  runtimeVerified: boolean;
};

const HEALTH = new Map<string, Health>();
const BREAKER_FAILURES = 3;
const BREAKER_COOLDOWN_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function health(providerId: string): Health {
  const existing = HEALTH.get(providerId);
  if (existing) return existing;
  const fresh: Health = {
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    rateLimitedUntil: null,
    consecutiveFailures: 0,
    runtimeVerified: false,
  };
  HEALTH.set(providerId, fresh);
  return fresh;
}

/** Test seam: clears in-process health so checks start from a known state. */
export function resetIntegrationHealth() {
  HEALTH.clear();
}

function envPresent(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function missingCredentials(provider: ProviderDefinition): string[] {
  return provider.credentials.filter((name) => !envPresent(name));
}

export function providerStatus(provider: ProviderDefinition): ProviderStatus {
  if (!provider.implemented) return "not_implemented";
  return missingCredentials(provider).length === 0 ? "ready" : "needs_connection";
}

function breakerOpen(providerId: string, now = Date.now()) {
  const state = health(providerId);
  return state.rateLimitedUntil !== null && state.rateLimitedUntil > now;
}

/** Free-only mode is the platform default and is read from the AI config. */
async function freeOnlyMode(): Promise<boolean> {
  try {
    const [{ zeroAiCostMode }, { freeAiOnly }] = await Promise.all([
      import("@/lib/ai/config"),
      import("@/lib/ai/free"),
    ]);
    return freeAiOnly() || zeroAiCostMode();
  } catch {
    return true;
  }
}

export function recordProviderSuccess(providerId: string) {
  const state = health(providerId);
  state.lastSuccessAt = Date.now();
  state.consecutiveFailures = 0;
  state.rateLimitedUntil = null;
  state.runtimeVerified = true;
}

export function recordProviderFailure(
  providerId: string,
  reason: string,
  options: { rateLimited?: boolean; retryAfterMs?: number } = {},
) {
  const state = health(providerId);
  state.lastFailureAt = Date.now();
  state.lastFailureReason = reason;
  state.consecutiveFailures += 1;
  if (options.rateLimited)
    state.rateLimitedUntil = Date.now() + (options.retryAfterMs ?? BREAKER_COOLDOWN_MS);
  else if (state.consecutiveFailures >= BREAKER_FAILURES)
    state.rateLimitedUntil = Date.now() + BREAKER_COOLDOWN_MS;
}

export type CapabilityResolution = {
  capability: Capability;
  provider: ProviderDefinition | null;
  status: ReturnType<typeof capabilityStatus>;
  deterministic: boolean;
  /** Providers that would be tried after the selected one. */
  fallbacks: ProviderDefinition[];
  reason: string | null;
};

/** Which provider (if any) may serve this capability right now. */
export async function resolveCapability(capability: Capability): Promise<CapabilityResolution> {
  const freeOnly = await freeOnlyMode();
  const eligible = providersFor(capability).filter(
    (provider) =>
      provider.implemented &&
      (!freeOnly || provider.cost !== "paid") &&
      missingCredentials(provider).length === 0 &&
      !breakerOpen(provider.id),
  );
  const provider = eligible[0] ?? null;
  const anyImplemented = providersFor(capability).some((entry) => entry.implemented);
  const status = capabilityStatus({ capability, selected: provider, anyImplemented });
  const paidBlocked =
    !provider &&
    freeOnly &&
    providersFor(capability).some((entry) => entry.implemented && entry.cost === "paid");
  return {
    capability,
    provider,
    status,
    deterministic: hasDeterministicPath(capability),
    fallbacks: eligible.slice(1),
    reason: provider
      ? null
      : paidBlocked
        ? "paid_provider_blocked_by_free_only"
        : status === "deterministic"
          ? "using_revora_engine"
          : status === "needs_connection"
            ? "needs_connection"
            : "no_provider_implemented",
  };
}

export type CapabilityCall<T> = {
  provider: ProviderDefinition;
  signal: AbortSignal;
};

export type CapabilityResult<T> =
  | { ok: true; provider: string; data: T; attempts: number }
  | {
      ok: false;
      provider: string | null;
      reason: string;
      /** True when Revora's own deterministic path should take over. */
      deterministic: boolean;
      attempts: number;
    };

function rateLimited(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate.?limit|quota/i.test(text);
}

/**
 * Runs `work` against the first authorized provider for the capability and
 * fails over to the next one on timeout, rate limit, 5xx or malformed output.
 * Never throws: a builder path can always continue deterministically.
 */
export async function callCapability<T>(
  capability: Capability,
  work: (call: CapabilityCall<T>) => Promise<T>,
  options: {
    timeoutMs?: number;
    /** Reject a structurally wrong answer so it fails over instead of shipping. */
    validate?: (value: T) => boolean;
  } = {},
): Promise<CapabilityResult<T>> {
  const resolution = await resolveCapability(capability);
  const chain = resolution.provider
    ? [resolution.provider, ...resolution.fallbacks]
    : ([] as ProviderDefinition[]);
  if (chain.length === 0)
    return {
      ok: false,
      provider: null,
      reason: resolution.reason ?? "unavailable",
      deterministic: resolution.deterministic,
      attempts: 0,
    };

  let attempts = 0;
  let lastReason = "unavailable";
  let lastProvider: string | null = null;
  for (const provider of chain) {
    attempts += 1;
    lastProvider = provider.id;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const data = await work({ provider, signal: controller.signal });
      if (options.validate && !options.validate(data)) {
        recordProviderFailure(provider.id, "malformed_response");
        lastReason = "malformed_response";
        continue;
      }
      recordProviderSuccess(provider.id);
      return { ok: true, provider: provider.id, data, attempts };
    } catch (error) {
      const reason =
        controller.signal.aborted
          ? "timeout"
          : rateLimited(error)
            ? "rate_limited"
            : error instanceof Error
              ? error.message.slice(0, 120)
              : "provider_error";
      recordProviderFailure(provider.id, reason, { rateLimited: reason === "rate_limited" });
      lastReason = reason;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    ok: false,
    provider: lastProvider,
    reason: lastReason,
    deterministic: resolution.deterministic,
    attempts,
  };
}

function providerSnapshot(provider: ProviderDefinition): ProviderSnapshot {
  const state = health(provider.id);
  return {
    ...provider,
    status: providerStatus(provider),
    missing: missingCredentials(provider),
    healthy: !breakerOpen(provider.id),
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastFailureReason: state.lastFailureReason,
    rateLimitedUntil: state.rateLimitedUntil,
    runtimeVerified: state.runtimeVerified,
  };
}

const DETAIL: Record<string, string> = {
  paid_provider_blocked_by_free_only:
    "A provider exists but it bills per call, so free-only mode blocks it.",
  using_revora_engine: "Nothing external is connected — Revora's own engine handles this.",
  needs_connection: "Revora can use this once the connection is authorized.",
  no_provider_implemented: "No provider is wired up for this yet, so Revora won't claim it works.",
};

/** One honest snapshot of every capability, for the admin surface. */
export async function capabilitySnapshot(): Promise<CapabilitySnapshot[]> {
  const freeOnly = await freeOnlyMode();
  const snapshots: CapabilitySnapshot[] = [];
  for (const capability of ALL_CAPABILITIES) {
    const resolution = await resolveCapability(capability);
    const providers = providersFor(capability).map(providerSnapshot);
    snapshots.push({
      capability,
      label: CAPABILITY_LABELS[capability],
      status: resolution.status,
      selected: resolution.provider?.id ?? null,
      fallback: resolution.fallbacks[0]?.id ?? null,
      deterministic: resolution.deterministic,
      providers,
      detail: resolution.provider
        ? `${resolution.provider.label} is serving this${resolution.fallbacks.length ? `, with ${resolution.fallbacks[0]!.label} as backup` : ""}.`
        : (DETAIL[resolution.reason ?? ""] ??
          (freeOnly ? "Not available while free-only mode is on." : "Not available.")),
    });
  }
  return snapshots;
}

/** Everything the admin page needs about providers, with no secret values. */
export function providerSnapshots(): ProviderSnapshot[] {
  return PROVIDERS.map(providerSnapshot);
}

export { selectProvider };
