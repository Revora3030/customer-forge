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

export type FreeProviderName = "cloudflare" | "openrouter" | "google";

export const FREE_PROVIDERS: FreeProviderName[] = ["cloudflare", "openrouter", "google"];

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
  cloudflare: {
    primary: "@cf/nvidia/nemotron-3-120b",
    fast: "@cf/zhipuai/glm-4.7-flash",
    coding: "@cf/nvidia/nemotron-3-120b",
    vision: "@cf/google/gemma-4-26b-a4b",
  },
  openrouter: {
    primary: "openrouter/auto:free",
    fast: "openrouter/auto:free",
    coding: "openrouter/auto:free",
    vision: "openrouter/auto:free",
  },
  google: {
    primary: "gemini-2.5-flash",
    fast: "gemini-2.5-flash-lite",
    coding: "gemini-2.5-flash",
    vision: "gemini-2.5-flash",
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
  return /:free$/i.test(model) || model === "openrouter/auto:free";
}

/**
 * Is this model free on this provider, as far as Revora is willing to assume?
 *
 * - OpenRouter: only explicit `:free` ids.
 * - Google: only free-tier-eligible flash/lite/gemma class models, never `pro`.
 * - Cloudflare: any Workers AI model slug that isn't a known paid name; the
 *   Neuron allowance covers models Cloudflare serves on the free tier, and
 *   restricted models are filtered by live discovery before they get here.
 */
export function isFreeEligibleModel(provider: FreeProviderName, model: string): boolean {
  const name = model.trim();
  if (name.length === 0) return false;
  if (PAID_MODEL_PATTERNS.some((pattern) => pattern.test(name))) return false;
  if (provider === "openrouter") return openRouterFree(name);
  if (provider === "google") return /flash|lite|gemma/i.test(name);
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
  const apiKey = env("GOOGLE_AI_FREE_API_KEY") ?? env("GOOGLE_AI_API_KEY");
  return apiKey ? { apiKey } : null;
}

export function freeModelFor(provider: FreeProviderName, role: ModelRole): string | null {
  const override = env(`FREE_AI_${provider.toUpperCase()}_MODEL_${role.toUpperCase()}`);
  const candidate = override ?? FREE_MODEL_DEFAULTS[provider][role] ?? null;
  if (candidate === null) return null;
  return isFreeEligibleModel(provider, candidate) ? candidate : null;
}

/* --------------------------------- ordering -------------------------------- */

const DEFAULT_ORDER: FreeProviderName[] = ["cloudflare", "openrouter", "google"];

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
