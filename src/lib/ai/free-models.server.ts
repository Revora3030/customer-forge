/**
 * Live free-model discovery.
 *
 * Free model pools change constantly, so Revora asks each provider which models
 * it is currently serving for free rather than trusting a fixed list. Results
 * are cached in-process for a few hours and every discovered id is still run
 * through `isFreeEligibleModel` before it can be used — discovery widens the
 * pool, it never relaxes the free-only rule.
 *
 * Discovery failure is never fatal: the configured/default model is used.
 * Server-only.
 */

import type { ModelRole } from "@/lib/ai/config";
import {
  isFreeEligibleModel,
  noteLlm7FreeModels,
  type FreeProviderCredentials,
  type FreeProviderName,
} from "@/lib/ai/free";

const TTL_MS = 6 * 60 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 6000;

type Entry = { at: number; models: string[] };
const cache = new Map<FreeProviderName, Entry>();

export function resetFreeModelDiscovery() {
  cache.clear();
}

/** Free model ids Revora has confirmed with the provider, newest first. */
export function discoveredFreeModels(provider: FreeProviderName): string[] {
  const entry = cache.get(provider);
  if (!entry || Date.now() - entry.at > TTL_MS) return [];
  return entry.models;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** OpenRouter: a model is free when every price component is zero. */
async function openRouterFreeModels(credentials: FreeProviderCredentials) {
  const payload = await fetchJson("https://openrouter.ai/api/v1/models", {
    authorization: `Bearer ${credentials.apiKey}`,
  });
  const data = (payload as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const free: string[] = [];
  for (const raw of data) {
    const entry = raw as { id?: unknown; pricing?: Record<string, unknown> };
    if (typeof entry.id !== "string") continue;
    const pricing = entry.pricing ?? {};
    const values = ["prompt", "completion", "request", "image"]
      .map((key) => pricing[key])
      .filter((value) => value !== undefined && value !== null);
    const allZero =
      values.length > 0 && values.every((value) => Number(value as string | number) === 0);
    if (allZero && isFreeEligibleModel("openrouter", entry.id)) free.push(entry.id);
  }
  return free;
}

/**
 * Cloudflare: the model search API reports each model's properties. Anything
 * flagged as restricted to a paid plan is dropped, so a model Cloudflare moves
 * behind Paid stops being selected without a code change.
 */
async function cloudflareFreeModels(credentials: FreeProviderCredentials) {
  if (!credentials.accountId) return [];
  const payload = await fetchJson(
    `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/models/search?task=Text%20Generation&per_page=200`,
    { authorization: `Bearer ${credentials.apiKey}` },
  );
  const result = (payload as { result?: unknown[] } | null)?.result;
  if (!Array.isArray(result)) return [];
  const free: string[] = [];
  for (const raw of result) {
    const entry = raw as { name?: unknown; properties?: unknown[] };
    if (typeof entry.name !== "string") continue;
    const properties = Array.isArray(entry.properties) ? entry.properties : [];
    const restricted = properties.some((property) => {
      const item = property as { property_id?: unknown; value?: unknown };
      const id = String(item.property_id ?? "").toLowerCase();
      const value = String(item.value ?? "").toLowerCase();
      if (id.includes("tier") || id.includes("plan")) return value.includes("paid");
      return id === "beta" ? false : false;
    });
    if (!restricted && isFreeEligibleModel("cloudflare", entry.name)) free.push(entry.name);
  }
  return free;
}

/**
 * Groq: every model on the free developer tier is listed; the speech and safety
 * models are dropped by the eligibility rule because they are not chat models.
 */
async function openAiCompatibleFreeModels(
  provider: FreeProviderName,
  url: string,
  credentials: FreeProviderCredentials,
) {
  const payload = await fetchJson(url, { authorization: `Bearer ${credentials.apiKey}` });
  const data = (payload as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const free: string[] = [];
  for (const raw of data) {
    const entry = raw as { id?: unknown };
    if (typeof entry.id !== "string") continue;
    if (isFreeEligibleModel(provider, entry.id)) free.push(entry.id);
  }
  return free;
}

/**
 * LLM7: the catalogue flags each model's billing mode and whether it supports
 * JSON mode. Only models that are NOT usage-based are free, so those ids are recorded as free-eligible and the
 * paid-balance models on the same endpoint stay unreachable.
 */
async function llm7FreeModels(credentials: FreeProviderCredentials) {
  const payload = await fetchJson("https://api.llm7.io/v1/models", {
    authorization: `Bearer ${credentials.apiKey}`,
  });
  const data = (payload as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const free: string[] = [];
  for (const raw of data) {
    const entry = raw as {
      id?: unknown;
      model_type?: unknown;
      usage_based_only?: unknown;
      json_mode?: unknown;
    };
    if (typeof entry.id !== "string") continue;
    if (entry.usage_based_only !== false) continue;
    if (entry.model_type !== "chat") continue;
    // Revora asks these models for structured JSON, and LLM7 rejects the
    // request outright on a model without JSON mode — so those are left out.
    if (entry.json_mode !== true) continue;
    free.push(entry.id);
  }
  noteLlm7FreeModels(free);
  return free.filter((id) => isFreeEligibleModel("llm7", id));
}

/**
 * Refreshes one provider's free pool. Safe to call often: it returns the cached
 * list until the TTL expires and swallows every provider failure.
 */
export async function refreshFreeModels(
  provider: FreeProviderName,
  credentials: FreeProviderCredentials,
): Promise<string[]> {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.models;
  const models =
    provider === "openrouter"
      ? await openRouterFreeModels(credentials)
      : provider === "cloudflare"
        ? await cloudflareFreeModels(credentials)
        : provider === "groq"
          ? await openAiCompatibleFreeModels(
              "groq",
              "https://api.groq.com/openai/v1/models",
              credentials,
            )
          : provider === "llm7"
            ? await llm7FreeModels(credentials)
            : // NVIDIA's hosted catalogue lists ids this account cannot invoke
            // (retired or not provisioned), so discovery would swap a verified
            // model for a dead one. The verified defaults stand.
            [];
  // Cache even an empty answer so a failing discovery endpoint isn't polled on
  // every builder request.
  cache.set(provider, { at: Date.now(), models });
  return models;
}

const ROLE_HINTS: Record<ModelRole, RegExp[]> = {
  fast: [/flash|lite|mini|small|8b|4b|instruct/i],
  primary: [/120b|70b|72b|32b|large|nemotron|glm|qwen|llama/i],
  coding: [/cod(?:e|er)|qwen|glm|nemotron/i],
  vision: [/vision|vl|gemma|multimodal|image/i],
  image: [],
  transcription: [],
};

/**
 * Picks a discovered free model for a role, preferring ids whose name matches
 * the role. Returns null when nothing suitable was discovered, and the caller
 * falls back to the configured default.
 */
export function pickDiscoveredModel(provider: FreeProviderName, role: ModelRole): string | null {
  const models = discoveredFreeModels(provider);
  if (models.length === 0) return null;
  for (const pattern of ROLE_HINTS[role]) {
    const match = models.find((model) => pattern.test(model));
    if (match) return match;
  }
  return role === "image" || role === "transcription" ? null : (models[0] ?? null);
}
