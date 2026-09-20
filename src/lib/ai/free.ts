/**
 * FREE-AI-FIRST configuration.
 *
 * Revora's builder must never need a paid AI plan. The deterministic native
 * engine answers everything it can safely answer; when a request genuinely
 * needs a generative model, it runs on a provider whose configured usage is
 * actually free. This file is the single place that decides:
 *
 * - which providers count as free,
 * - which of their models Revora is allowed to pick,
 * - what the provider's published free allowance is,
 * - the order they are tried in,
 * - and the hard rule that a paid model can never be selected here.
 *
 * Every value is read from the server environment at call time, so a provider
 * or model change is configuration, not a deploy of new code. Server-only:
 * never import this from a component.
 */

import type { ModelRole, ProviderName } from "@/lib/ai/config";

export type FreeProviderName =
  | "cloudflare"
  | "groq"
  | "nvidia"
  | "llm7"
  | "openrouter"
  | "google";

export const FREE_PROVIDERS: FreeProviderName[] = [
  "cloudflare",
  "groq",
  "nvidia",
  "llm7",
  "openrouter",
  "google",
];

export function isFreeProvider(name: string): name is FreeProviderName {
  return (FREE_PROVIDERS as string[]).includes(name);
}

/**
 * What each provider publishes as its free allowance. These are shown to the
 * admin verbatim as the provider's own published limit — Revora does not claim
 * unlimited free usage anywhere.
 */
export const FREE_ALLOWANCE: Record<
  FreeProviderName,
  { label: string; allowance: string; dailyRequestCap: number | null }
> = {
  cloudflare: {
    label: "Cloudflare Workers AI",
    allowance: "Workers Free: 10,000 Neurons per day (shared across models).",
    dailyRequestCap: null,
  },
  groq: {
    label: "Groq free developer tier",
    allowance: "Free developer tier: per-minute and per-day request limits per model.",
    dailyRequestCap: null,
  },
  nvidia: {
    label: "NVIDIA NIM free developer allowance",
    allowance: "Free developer allowance: rate-limited requests to hosted NIM models.",
    dailyRequestCap: null,
  },
  llm7: {
    label: "LLM7.io free tier",
    allowance: "Free tier: rate-limited requests to its non usage-based models.",
    dailyRequestCap: null,
  },
  openrouter: {
    label: "OpenRouter free models",
    allowance: "Free plan: free-tier models only, 50 requests per day.",
    dailyRequestCap: 50,
  },
  google: {
    label: "Google Gemini API free tier",
    allowance: "Gemini API free tier: per-minute and per-day request limits per model.",
    dailyRequestCap: null,
  },
};

/**
 * Conservative defaults per role, used only when live free-model discovery is
 * unavailable. Every one of these is overridable with
 * `FREE_AI_<PROVIDER>_MODEL_<ROLE>`, and every one is re-checked against the
 * free-eligibility rules below before it can be used.
 */
const FREE_MODEL_DEFAULTS: Record<FreeProviderName, Partial<Record<ModelRole, string>>> = {
  // Verified against Cloudflare's live Workers AI catalogue; live discovery can
  // widen this, and every id is still re-checked for free eligibility.
  cloudflare: {
    primary: "@cf/openai/gpt-oss-120b",
    fast: "@cf/meta/llama-3.2-3b-instruct",
    coding: "@cf/qwen/qwen2.5-coder-32b-instruct",
    vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
  },
  // Verified live against Groq's free developer-tier catalogue. Groq serves no
  // multimodal model to this key, so `vision` is deliberately absent and the
  // router moves on to a provider that can read pictures.
  groq: {
    primary: "openai/gpt-oss-120b",
    fast: "openai/gpt-oss-20b",
    coding: "qwen/qwen3.8-27b",
  },
  // Verified live against this NVIDIA key's hosted NIM catalogue. Only these
  // answered; several listed ids are retired or not served to this account.
  nvidia: {
    primary: "nvidia/nemotron-3-super-120b-a12b",
    fast: "nvidia/nemotron-3.5-lightning-30b-a3b",
    coding: "nvidia/nemotron-3-super-120b-a12b",
    vision: "meta/llama-3.2-11b-vision-instruct",
  },
  // Verified live against LLM7's catalogue: only its non usage-based (free)
  // chat models. LLM7 serves no free multimodal model, so `vision` is absent
  // and the router moves on to a provider that can read pictures.
  llm7: {
    primary: "codestral-latest",
    fast: "mistral-Nemo-Instruct-2407",
    coding: "codestral-latest",
  },
  // Verified live against OpenRouter's zero-price pool. `openrouter/free` is
  // its free auto-router, so it survives individual models being retired.
  openrouter: {
    primary: "nvidia/nemotron-3-super-120b-a12b:free",
    fast: "openrouter/free",
    coding: "cohere/north-mini-code:free",
    vision: "inclusionai/ling-3.0-flash-vl:free",
  },
  // Verified live against the Gemini free-tier catalogue; the 2.5 line is no
  // longer served to new keys, so the current flash/flash-lite class is used.
  google: {
    primary: "gemini-3.6-flash",
    fast: "gemini-3.5-flash-lite",
    coding: "gemini-3.6-flash",
    vision: "gemini-3.6-flash",
  },
};

/** Roles no free provider serves: Revora falls back to its native engine. */
export const FREE_UNSERVED_ROLES: ModelRole[] = ["image", "transcription"];

function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function flag(name: string, fallback: boolean) {
  const raw = (env(name) ?? "").toLowerCase();
  if (raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}

/** Free AI is on by default; a provider still needs credentials to be usable. */
export function freeAiEnabled() {
  return flag("FREE_AI_ENABLED", true);
}

/**
 * Free-only is on by default and is what stops a paid model becoming a silent
 * fallback. An operator has to opt out explicitly on the server to let paid
 * provider accounts be reached at all.
 */
export function freeAiOnly() {
  return flag("FREE_AI_ONLY", true);
}

/* -------------------------- free-eligibility rules -------------------------- */

/**
 * Model names that are paid on the providers Revora talks to. A model matching
 * any of these can never be selected by the free router, whatever an
 * environment override says.
 */
const PAID_MODEL_PATTERNS: RegExp[] = [
  /^gpt-/i,
  /^o\d/i,
  /^chatgpt/i,
  /^claude/i,
  /^grok/i,
  /^deepseek-(?:chat|reasoner)$/i,
  /gemini-[\d.]+-pro/i,
  /-pro(?:-preview)?$/i,
  /\bgpt-image\b/i,
  /^whisper/i,
];

/** Free OpenRouter model ids are suffixed `:free` (or the free auto router). */
function openRouterFree(model: string) {
  // `:free` ids are priced at zero by OpenRouter; `openrouter/free` and
  // `openrouter/auto:free` are its zero-price auto routers.
  return /:free$/i.test(model) || model === "openrouter/free" || model === "openrouter/auto:free";
}

/**
 * Is this model free on this provider, as far as Revora is willing to assume?
 *
 * - OpenRouter: only explicit `:free` ids.
 * - Google: only free-tier-eligible flash/lite/gemma class models, never `pro`.
 * - Groq: chat models on its free developer tier, excluding the speech and
 *   safety models, which are not text generation at all.
 * - Cloudflare: any Workers AI model slug that isn't a known paid name; the
 *   Neuron allowance covers models Cloudflare serves on the free tier, and
 *   restricted models are filtered by live discovery before they get here.
 */
const GROQ_NON_CHAT = /whisper|orpheus|prompt-guard|safeguard|tts|playai/i;

/**
 * Groq ids are vendor-prefixed (`openai/gpt-oss-120b`), so the paid-name check
 * has to run on the model part as well — otherwise a prefix would smuggle a
 * paid family past it. `gpt-oss` is OpenAI's open-weight family Groq serves
 * free, so it is the one explicitly allowed `gpt-` name.
 */
function groqFreeEligible(name: string) {
  if (GROQ_NON_CHAT.test(name)) return false;
  const model = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
  if (/^gpt-oss/i.test(model)) return true;
  return !PAID_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}

/**
 * NVIDIA NIM ids are vendor-prefixed (`nvidia/nemotron-3-super-120b-a12b`). The
 * hosted catalogue also lists embedders, retrievers, guard/safety models,
 * parsers and translators, none of which are chat generation — they are
 * rejected so the router never spends an attempt on one.
 */
const NVIDIA_NON_CHAT =
  /embed|retriev|rerank|guard|safety|topic-control|parse|nvclip|translate|reward|detector|ocr|diffusion/i;

function nvidiaFreeEligible(name: string) {
  if (!name.includes("/")) return false;
  if (NVIDIA_NON_CHAT.test(name)) return false;
  const model = name.slice(name.lastIndexOf("/") + 1);
  return !PAID_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}

/**
 * LLM7 hosts free and usage-based (paid-balance) models on one endpoint, and the
 * id alone does not say which is which. So Revora keeps an allowlist: the ids it
 * verified as free, plus any id live discovery saw flagged as not usage-based.
 * Anything else — including every paid-balance model on the same endpoint — is
 * rejected before a request can be spent on it.
 */
const LLM7_VERIFIED_FREE = new Set(
  ["GLM-5.3-Flash", "codestral-latest", "minimax-m2.7", "mistral-Nemo-Instruct-2407"].map((id) =>
    id.toLowerCase(),
  ),
);

const llm7DiscoveredFree = new Set<string>();

/** Records ids LLM7 currently reports as not usage-based (i.e. free). */
export function noteLlm7FreeModels(ids: string[]) {
  for (const id of ids) llm7DiscoveredFree.add(id.trim().toLowerCase());
}

export function resetLlm7FreeModels() {
  llm7DiscoveredFree.clear();
}

function llm7FreeEligible(name: string) {
  const id = name.trim().toLowerCase();
  return LLM7_VERIFIED_FREE.has(id) || llm7DiscoveredFree.has(id);
}

export function isFreeEligibleModel(provider: FreeProviderName, model: string): boolean {
  const name = model.trim();
  if (name.length === 0) return false;
  const unprefixed = provider === "groq" ? name.replace(/^openai\/(?=gpt-oss)/i, "") : name;
  if (PAID_MODEL_PATTERNS.some((pattern) => pattern.test(unprefixed))) {
    if (!(provider === "groq" && /^gpt-oss/i.test(unprefixed))) return false;
  }
  if (provider === "openrouter") return openRouterFree(name);
  if (provider === "google") return /flash|lite|gemma/i.test(name);
  if (provider === "groq") return groqFreeEligible(name);
  if (provider === "nvidia") return nvidiaFreeEligible(name);
  return name.startsWith("@cf/");
}

/* ------------------------------- credentials ------------------------------- */

export type FreeProviderCredentials = { apiKey: string; accountId?: string };

/**
 * Credentials for a free provider, or null when they are missing. Missing
 * credentials mark the provider unavailable — they never throw.
 */
export function freeProviderCredentials(
  provider: FreeProviderName,
): FreeProviderCredentials | null {
  if (provider === "cloudflare") {
    const apiKey = env("CLOUDFLARE_AI_API_TOKEN") ?? env("CLOUDFLARE_API_TOKEN");
    const accountId = env("CLOUDFLARE_ACCOUNT_ID");
    if (!apiKey || !accountId) return null;
    return { apiKey, accountId };
  }
  if (provider === "openrouter") {
    const apiKey = env("OPENROUTER_API_KEY");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "groq") {
    const apiKey = env("GROQ_API_KEY");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "nvidia") {
    const apiKey = env("NVIDIA_NIM_API_KEY") ?? env("NVIDIA_API_KEY");
    return apiKey ? { apiKey } : null;
  }
  // Gemini needs its OWN free-tier key. A general Google key may sit on a
  // billing-enabled project, where the same models are charged — so it is only
  // treated as free when an operator opts in explicitly.
  const apiKey =
    env("GOOGLE_AI_FREE_API_KEY") ??
    (env("GOOGLE_AI_FREE_TIER") === "true" ? env("GOOGLE_AI_API_KEY") : null);
  return apiKey ? { apiKey } : null;
}

export function freeModelFor(provider: FreeProviderName, role: ModelRole): string | null {
  const override = env(`FREE_AI_${provider.toUpperCase()}_MODEL_${role.toUpperCase()}`);
  const candidate = override ?? FREE_MODEL_DEFAULTS[provider][role] ?? null;
  if (candidate === null) return null;
  return isFreeEligibleModel(provider, candidate) ? candidate : null;
}

/* --------------------------------- ordering -------------------------------- */

const DEFAULT_ORDER: FreeProviderName[] = [
  "cloudflare",
  "groq",
  "nvidia",
  "openrouter",
  "google",
];

/**
 * An in-process priority override an authorised admin can set. It is deliberately
 * process-local and temporary: the durable order is the
 * `FREE_AI_PROVIDER_ORDER` environment variable.
 */
let runtimeOrder: FreeProviderName[] | null = null;

export function setRuntimeFreeProviderOrder(order: string[] | null) {
  if (order === null) {
    runtimeOrder = null;
    return;
  }
  const cleaned = order.filter(isFreeProvider);
  runtimeOrder = cleaned.length > 0 ? cleaned : null;
}

export function runtimeFreeProviderOrder() {
  return runtimeOrder;
}

/** Configured order first, then any remaining free provider. */
export function freeProviderOrder(): FreeProviderName[] {
  const configured =
    runtimeOrder ??
    (env("FREE_AI_PROVIDER_ORDER") ?? "")
      .split(/[,\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(isFreeProvider);
  const order: FreeProviderName[] = [];
  for (const name of [...configured, ...DEFAULT_ORDER])
    if (!order.includes(name)) order.push(name);
  return order;
}

export type FreeProviderResolution = {
  name: FreeProviderName;
  provider: ProviderName;
  credentials: FreeProviderCredentials;
  model: string;
};

/**
 * The free chain for one role: every configured free provider that has a
 * free-eligible model for that role, in priority order. Empty means "no free
 * AI is available right now" — the caller then uses the native engine.
 */
export function freeProviderChain(role: ModelRole): FreeProviderResolution[] {
  if (!freeAiEnabled()) return [];
  const chain: FreeProviderResolution[] = [];
  for (const name of freeProviderOrder()) {
    const credentials = freeProviderCredentials(name);
    if (!credentials) continue;
    const model = freeModelFor(name, role);
    if (!model) continue;
    chain.push({ name, provider: name as ProviderName, credentials, model });
  }
  return chain;
}

/** Which free providers hold credentials — for the admin status surface. */
export function freeProviderReadiness() {
  return FREE_PROVIDERS.map((name) => {
    const credentials = freeProviderCredentials(name);
    return {
      name,
      label: FREE_ALLOWANCE[name].label,
      allowance: FREE_ALLOWANCE[name].allowance,
      configured: credentials !== null,
      models: (["primary", "fast", "coding", "vision"] as ModelRole[])
        .map((role) => ({ role, model: freeModelFor(name, role) }))
        .filter((entry): entry is { role: ModelRole; model: string } => entry.model !== null),
    };
  });
}

/* ------------------------------ free budgets ------------------------------- */

/**
 * A per-provider daily request budget, so one workspace cannot burn the whole
 * shared free allowance. Counts are process-local and reset each UTC day; they
 * sit in front of, not instead of, the workspace limits in `aiLimits()`.
 */
const budget = new Map<string, { day: string; used: number }>();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function budgetCap(provider: FreeProviderName) {
  const override = Number(env(`FREE_AI_${provider.toUpperCase()}_DAILY_CAP`));
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return FREE_ALLOWANCE[provider].dailyRequestCap;
}

export function freeBudgetRemaining(provider: FreeProviderName): number | null {
  const cap = budgetCap(provider);
  if (cap === null) return null;
  const entry = budget.get(provider);
  const used = entry && entry.day === today() ? entry.used : 0;
  return Math.max(0, cap - used);
}

export function freeBudgetAllows(provider: FreeProviderName) {
  const remaining = freeBudgetRemaining(provider);
  return remaining === null || remaining > 0;
}

export function noteFreeUse(provider: FreeProviderName) {
  const day = today();
  const entry = budget.get(provider);
  budget.set(
    provider,
    entry && entry.day === day ? { day, used: entry.used + 1 } : { day, used: 1 },
  );
}

/** Test and operations helper: clears the in-process budget counters. */
export function resetFreeBudget() {
  budget.clear();
}
