/**
 * Honest provider status for the Jarvis Models screen. Each level needs its
 * own evidence: a key being set is "configured", a recorded successful call is
 * "reachable", a good recent success rate with the circuit closed is
 * "healthy". Catalog entries alone never count as working.
 */
export type ProviderLevel = "not_configured" | "configured" | "reachable" | "healthy" | "degraded" | "resting" | "rate_limited";

export type RuntimeRow = {
  provider: string; day: string; used: number; failures: number; open_until: string | null;
  last_success_at: string | null; last_failure_at: string | null; last_latency_ms: number | null; rate_limited_at: string | null;
};
export type TraceRow = { provider: string | null; model: string | null; ok: boolean | null; created_at: string };

export type ProviderStatus = {
  provider: string;
  configured: boolean | null;
  level: ProviderLevel;
  calls24h: number;
  failures24h: number;
  successRate24h: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  restingUntil: string | null;
  rateLimitedAt: string | null;
  lastLatencyMs: number | null;
  usedToday: number | null;
  models: { model: string; calls: number; ok: number }[];
};

const HOUR = 3600000;

export function classifyProviders(input: { runtime: RuntimeRow[]; trace: TraceRow[]; configured: Record<string, boolean>; now: number }): ProviderStatus[] {
  const today = new Date(input.now).toISOString().slice(0, 10);
  const latest = new Map<string, RuntimeRow>();
  for (const r of input.runtime) {
    const cur = latest.get(r.provider);
    if (!cur || r.day > cur.day) latest.set(r.provider, r);
  }
  const names = new Set<string>([...Object.keys(input.configured), ...latest.keys(), ...input.trace.map((t) => t.provider ?? "").filter(Boolean)]);
  const out: ProviderStatus[] = [];
  for (const provider of names) {
    const rt = latest.get(provider) ?? null;
    const calls = input.trace.filter((t) => t.provider === provider);
    const okCalls = calls.filter((t) => t.ok).length;
    const byModel = new Map<string, { calls: number; ok: number }>();
    for (const c of calls) {
      const m = c.model ?? "unknown";
      const e = byModel.get(m) ?? { calls: 0, ok: 0 };
      e.calls += 1; if (c.ok) e.ok += 1; byModel.set(m, e);
    }
    const configured = provider in input.configured ? input.configured[provider]! : null;
    const resting = rt?.open_until && Date.parse(rt.open_until) > input.now ? rt.open_until : null;
    const recentRateLimit = rt?.rate_limited_at && input.now - Date.parse(rt.rate_limited_at) < HOUR ? rt.rate_limited_at : null;
    const rate = calls.length ? okCalls / calls.length : null;
    const lastOkTrace = calls.filter((c) => c.ok).map((c) => c.created_at).sort().at(-1) ?? null;
    const lastSuccessAt = [rt?.last_success_at ?? null, lastOkTrace].filter(Boolean).sort().at(-1) ?? null;
    let level: ProviderLevel;
    if (configured === false) level = "not_configured";
    else if (resting) level = "resting";
    else if (recentRateLimit) level = "rate_limited";
    else if (!lastSuccessAt) level = "configured";
    else if (rate !== null && calls.length >= 3 && rate >= 0.8) level = "healthy";
    else if (rate !== null && calls.length >= 3) level = "degraded";
    else level = "reachable";
    out.push({
      provider,
      configured,
      level,
      calls24h: calls.length,
      failures24h: calls.length - okCalls,
      successRate24h: rate === null ? null : Math.round(rate * 100),
      lastSuccessAt,
      lastFailureAt: rt?.last_failure_at ?? null,
      restingUntil: resting,
      rateLimitedAt: rt?.rate_limited_at ?? null,
      lastLatencyMs: rt?.last_latency_ms ?? null,
      usedToday: rt && rt.day === today ? rt.used : null,
      models: [...byModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.calls - a.calls).slice(0, 8),
    });
  }
  const order: ProviderLevel[] = ["healthy", "reachable", "degraded", "rate_limited", "resting", "configured", "not_configured"];
  return out.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || b.calls24h - a.calls24h);
}

/** Which providers have credentials. Booleans only; values never leave the server. */
export function configuredProviders(env: Readonly<Record<string, string | undefined>>): Record<string, boolean> {
  const has = (...keys: string[]) => keys.some((k) => Boolean(env[k]?.trim()));
  return {
    google: has("GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"),
    openai: has("OPENAI_API_KEY"),
    anthropic: has("ANTHROPIC_API_KEY"),
    lovable: has("LOVABLE_API_KEY"),
    groq: has("GROQ_API_KEY"),
    cerebras: has("CEREBRAS_API_KEY", "Cerebras"),
    mistral: has("MISTRAL_API_KEY", "Mistral"),
    cohere: has("COHERE_API_KEY", "Cohere"),
    nvidia: has("NVIDIA_NIM_API_KEY", "NVIDIA_API_KEY"),
    llm7: has("LLM7_API_KEY"),
    cloudflare: has("CLOUDFLARE_AI_API_TOKEN", "CLOUDFLARE_API_TOKEN") && has("CLOUDFLARE_ACCOUNT_ID"),
    openrouter: has("OPENROUTER_API_KEY"),
    deepseek: has("DEEPSEEK_API_KEY", "Deepseek"),
    huggingface: has("HUGGINGFACE_API_KEY", "Huggingface", "HF_TOKEN"),
    sambanova: has("SAMBANOVA_API_KEY"),
    together: has("TOGETHER_API_KEY"),
    siliconflow: has("SILICONFLOW_API_KEY"),
    opencode: has("OPENCODE_API_KEY"),
    omniroute: has("OMNIROUTE_API_KEY") && has("OMNIROUTE_BASE_URL"),
    selfhosted: has("SELFHOSTED_AI_API_KEY") && has("SELFHOSTED_AI_BASE_URL"),
  };
}
