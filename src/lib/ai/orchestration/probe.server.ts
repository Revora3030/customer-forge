/**
 * CAPABILITY PROBES.
 *
 * A capability is never claimed from a model's name. When the platform needs to
 * know whether a discovered model can really return structured JSON, call a
 * tool, read a picture or transcribe speech, it asks the model — once — with a
 * tiny, cheap, content-free request, and caches the verdict with a timestamp and
 * a probe version.
 *
 * Failures are cached too, with exponential backoff, so a broken provider is
 * never hammered and a provider outage is never recorded as a missing feature.
 *
 * Server-only. Probes go through the existing pinned-free-model path, so every
 * gate (budget, breaker, timeout, telemetry) still applies.
 */

import type { Capability, CapabilityState } from "@/lib/ai/orchestration/contracts";
import type { FreeProviderName } from "@/lib/ai/free";

/** Bump when a probe's prompt or acceptance rule changes. */
export const PROBE_VERSION = 1;

const OK_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_BASE_MS = 10 * 60 * 1000;
const FAIL_MAX_MS = 6 * 60 * 60 * 1000;

type ProbeEntry = {
  state: CapabilityState;
  at: number;
  version: number;
  failures: number;
};

const cache = new Map<string, ProbeEntry>();

function key(provider: string, model: string, capability: Capability) {
  return `${provider}/${model}#${capability}`;
}

export function resetProbeCache() {
  cache.clear();
}

/** Everything proven (or disproven) about one model, for the catalogue. */
export function probeEvidence(
  provider: string,
  model: string,
): Partial<Record<Capability, CapabilityState>> {
  const evidence: Partial<Record<Capability, CapabilityState>> = {};
  for (const [entryKey, entry] of cache) {
    if (!entryKey.startsWith(`${provider}/${model}#`)) continue;
    if (entry.version !== PROBE_VERSION) continue;
    const capability = entryKey.split("#")[1] as Capability;
    if (fresh(entry)) evidence[capability] = entry.state;
    else evidence[capability] = "unknown";
  }
  return evidence;
}

function fresh(entry: ProbeEntry) {
  if (entry.state === "supported" || entry.state === "unsupported")
    return Date.now() - entry.at < OK_TTL_MS;
  const backoff = Math.min(FAIL_MAX_MS, FAIL_BASE_MS * 2 ** Math.max(0, entry.failures - 1));
  return Date.now() - entry.at < backoff;
}

export type ProbeRunner = (input: {
  provider: FreeProviderName;
  model: string;
  capability: Capability;
}) => Promise<{ ok: boolean; satisfied: boolean }>;

/** The probes Revora runs, and what counts as a pass. */
const PROBES: Partial<Record<Capability, { prompt: string; json: boolean; accept: (text: string, data: Record<string, unknown> | null) => boolean }>> = {
  text_generation: {
    prompt: 'Reply with exactly the word: ready',
    json: false,
    accept: (text) => /ready/i.test(text),
  },
  structured_output: {
    prompt: 'Reply with JSON only: {"ok":true}',
    json: true,
    accept: (_text, data) => data !== null && data["ok"] === true,
  },
  tool_calling: {
    prompt:
      'A tool named ping takes no arguments. Reply with JSON only: {"tool":"ping","arguments":{}}',
    json: true,
    accept: (_text, data) => data !== null && data["tool"] === "ping",
  },
  reasoning: {
    prompt:
      'A shop opens at 9 and closes at 17. Reply with JSON only: {"hours":<number of hours open>}',
    json: true,
    accept: (_text, data) => data !== null && Number(data["hours"]) === 8,
  },
  code_generation: {
    prompt:
      'Reply with JSON only: {"code":"<a one-line TypeScript function named add that returns a+b>"}',
    json: true,
    accept: (_text, data) =>
      data !== null && typeof data["code"] === "string" && /add/.test(String(data["code"])),
  },
};

export function probeableCapabilities(): Capability[] {
  return Object.keys(PROBES) as Capability[];
}

/**
 * Probes one capability, honouring the cache and the backoff. Returns the
 * cached verdict without calling the provider when the evidence is still fresh.
 */
export async function probeCapability(input: {
  provider: FreeProviderName;
  model: string;
  capability: Capability;
  /** Injected in tests; defaults to the real pinned-free-model path. */
  runner?: ProbeRunner;
  caller?: { organizationId?: string | null; userId?: string | null };
}): Promise<CapabilityState> {
  const probe = PROBES[input.capability];
  if (!probe) return "unknown";
  const cacheKey = key(input.provider, input.model, input.capability);
  const cached = cache.get(cacheKey);
  if (cached && cached.version === PROBE_VERSION && fresh(cached)) return cached.state;

  const runner = input.runner ?? defaultRunner(input.caller);
  let state: CapabilityState;
  let failures = cached?.failures ?? 0;
  try {
    const result = await runner({
      provider: input.provider,
      model: input.model,
      capability: input.capability,
    });
    if (!result.ok) {
      failures += 1;
      state = "probe_failed";
    } else {
      failures = 0;
      state = result.satisfied ? "supported" : "unsupported";
    }
  } catch {
    failures += 1;
    state = "probe_failed";
  }
  cache.set(cacheKey, { state, at: Date.now(), version: PROBE_VERSION, failures });
  return state;
}

function defaultRunner(caller?: { organizationId?: string | null; userId?: string | null }): ProbeRunner {
  return async ({ provider, model, capability }) => {
    const probe = PROBES[capability];
    if (!probe) return { ok: false, satisfied: false };
    const { callPinnedFreeModel } = await import("@/lib/ai/router.server");
    const result = await callPinnedFreeModel(
      {
        task: `probe:${capability}`,
        organizationId: caller?.organizationId ?? null,
        userId: caller?.userId ?? null,
      },
      {
        provider,
        model,
        role: "fast",
        messages: [{ role: "user", content: probe.prompt }],
        json: probe.json,
        maxOutputTokens: 64,
        timeoutMs: 20_000,
      },
    );
    return { ok: true, satisfied: probe.accept(result.text, result.data) };
  };
}

/**
 * Probes a set of models for a set of capabilities, in bounded parallel. Only
 * capabilities that matter for the work at hand should be passed in — probing is
 * a real provider call and is never run speculatively across the catalogue.
 */
export async function probeModels(input: {
  models: { provider: FreeProviderName; model: string }[];
  capabilities: Capability[];
  concurrency?: number;
  runner?: ProbeRunner;
}): Promise<{ provider: string; model: string; capability: Capability; state: CapabilityState }[]> {
  const jobs: { provider: FreeProviderName; model: string; capability: Capability }[] = [];
  for (const entry of input.models)
    for (const capability of input.capabilities)
      if (PROBES[capability]) jobs.push({ ...entry, capability });

  const results: {
    provider: string;
    model: string;
    capability: Capability;
    state: CapabilityState;
  }[] = [];
  const limit = Math.max(1, input.concurrency ?? 4);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const job = jobs[index];
      if (!job) return;
      const state = await probeCapability({
        ...job,
        ...(input.runner ? { runner: input.runner } : {}),
      });
      results.push({ provider: job.provider, model: job.model, capability: job.capability, state });
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}
