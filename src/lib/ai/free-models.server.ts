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
/**
 * Text and image pools are discovered from different catalogue endpoints, so
 * they are cached separately: an image key is `"<provider>#image"`.
 */
const cache = new Map<string, Entry>();

function poolKey(provider: FreeProviderName, role?: ModelRole) {
  return role === "image" ? `${provider}#image` : provider;
}

export function resetFreeModelDiscovery() {
  cache.clear();
}

/** Free model ids Revora has confirmed with the provider, newest first. */
export function discoveredFreeModels(provider: FreeProviderName, role?: ModelRole): string[] {
  const entry = cache.get(poolKey(provider, role));
  if (!entry || Date.now() - entry.at > TTL_MS) return [];
  return entry.models;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      // Identify Revora: some catalogue endpoints refuse an unidentified client.
      headers: {
        accept: "application/json",
        "user-agent": "RevoraGrowthSystems/1.0 (+https://revoragrowthsystems.com)",
        ...headers,
      },
      signal: controller.signal,
    });
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
 * Google: the Gemini catalogue lists every model this key can address. Only
 * models that actually answer `generateContent` are kept, and each id still has
 * to pass the free-eligibility rule — which admits the flash/lite/gemma classes
 * and rejects the `pro` classes and anything billed. Without this, Gemini's two
 * configured ids would silently rot when Google retires them.
 */
async function googleFreeModels(credentials: FreeProviderCredentials) {
  const payload = await fetchJson("https://generativelanguage.googleapis.com/v1beta/models", {
    "x-goog-api-key": credentials.apiKey,
  });
  const models = (payload as { models?: unknown[] } | null)?.models;
  if (!Array.isArray(models)) return [];
  const free: string[] = [];
  for (const raw of models) {
    const entry = raw as { name?: unknown; supportedGenerationMethods?: unknown[] };
    if (typeof entry.name !== "string") continue;
    const methods = Array.isArray(entry.supportedGenerationMethods)
      ? entry.supportedGenerationMethods.map(String)
      : [];
    if (methods.length > 0 && !methods.includes("generateContent")) continue;
    const id = entry.name.replace(/^models\//, "");
    if (isFreeEligibleModel("google", id)) free.push(id);
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
 * Cloudflare image models Revora may run: the text-to-image catalogue, minus
 * anything priced above zero, minus partner models with unverified pricing, and
 * minus the inpainting model (it needs a mask Revora does not supply). Every id
 * still passes `isFreeEligibleModel`, so a billed model can never enter a chain.
 */
async function cloudflareFreeImageModels(credentials: FreeProviderCredentials) {
  if (!credentials.accountId) return [];
  const payload = await fetchJson(
    `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/models/search?task=Text-to-Image&per_page=100`,
    { authorization: `Bearer ${credentials.apiKey}` },
  );
  const result = (payload as { result?: unknown[] } | null)?.result;
  if (!Array.isArray(result)) return [];
  const free: string[] = [];
  for (const raw of result) {
    const entry = raw as { name?: unknown; properties?: unknown[] };
    if (typeof entry.name !== "string") continue;
    if (/inpainting|img2img/i.test(entry.name)) continue;
    const properties = Array.isArray(entry.properties) ? entry.properties : [];
    let billed = false;
    for (const property of properties) {
      const item = property as { property_id?: unknown; value?: unknown };
      const id = String(item.property_id ?? "").toLowerCase();
      if (id === "partner" && String(item.value ?? "").toLowerCase() === "true") billed = true;
      if (id === "price" && Array.isArray(item.value))
        for (const price of item.value as { price?: unknown }[])
          if (Number(price?.price ?? 0) > 0) billed = true;
    }
    if (!billed && isFreeEligibleModel("cloudflare", entry.name)) free.push(entry.name);
  }
  return free;
}

/**
 * Refreshes one provider's free pool. Safe to call often: it returns the cached
 * list until the TTL expires and swallows every provider failure. Pass
 * `role: "image"` to refresh the text-to-image pool instead of the text pool.
 */
export async function refreshFreeModels(
  provider: FreeProviderName,
  credentials: FreeProviderCredentials,
  role?: ModelRole,
): Promise<string[]> {
  const key = poolKey(provider, role);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.models;
  if (role === "image") {
    // Cloudflare is the only configured provider serving free image models.
    const images = provider === "cloudflare" ? await cloudflareFreeImageModels(credentials) : [];
    cache.set(key, { at: Date.now(), models: images });
    return images;
  }
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
            : provider === "google"
              ? await googleFreeModels(credentials)
              : // NVIDIA's hosted catalogue lists ids this account cannot invoke
              // (retired or not provisioned), so discovery would swap a verified
              // model for a dead one. The verified defaults stand.
              [];
  // Cache even an empty answer so a failing discovery endpoint isn't polled on
  // every builder request.
  cache.set(key, { at: Date.now(), models });
  return models;
}

const ROLE_HINTS: Record<ModelRole, RegExp[]> = {
  fast: [/flash|lite|mini|small|8b|4b|instruct/i],
  primary: [/120b|70b|72b|32b|large|nemotron|glm|qwen|llama/i],
  // Creative judgement: the biggest reasoning-class models first, then the
  // strong mid-size ones. A tiny model picks bland, repetitive palettes.
  design: [/235b|480b|120b|70b|72b|maverick|scout|nemotron|glm|qwen3|deepseek/i, /32b|27b|30b/i],
  coding: [/cod(?:e|er)|qwen|glm|nemotron/i],
  vision: [/vision|vl|gemma|multimodal|image/i],
  // Text-to-image families Revora has verified as free on Workers AI. Fastest
  // and cleanest first (flux schnell), then the diffusion family as backup.
  image: [/flux-1|schnell/i, /stable-diffusion|sdxl|dreamshaper/i],
  transcription: [],
};

/** Roles where a name-based guess is unsafe, so only an explicit match counts. */
const STRICT_ROLES: ModelRole[] = ["image", "transcription"];

/**
 * Every discovered free model that suits a role, best match first, then the
 * rest of the pool. The router turns this into a deep failover list, so one
 * provider's whole free catalogue can cover a request instead of a single id.
 */
export function pickDiscoveredModels(
  provider: FreeProviderName,
  role: ModelRole,
  limit = 4,
): string[] {
  const models = discoveredFreeModels(provider, role);
  if (models.length === 0 || limit <= 0) return [];
  const ranked: string[] = [];
  const add = (model: string) => {
    if (!ranked.includes(model) && ranked.length < limit) ranked.push(model);
  };
  for (const pattern of ROLE_HINTS[role])
    for (const model of models) if (pattern.test(model)) add(model);
  if (!STRICT_ROLES.includes(role)) for (const model of models) add(model);
  return ranked;
}

/**
 * Picks a discovered free model for a role, preferring ids whose name matches
 * the role. Returns null when nothing suitable was discovered, and the caller
 * falls back to the configured default.
 */
export function pickDiscoveredModel(provider: FreeProviderName, role: ModelRole): string | null {
  return pickDiscoveredModels(provider, role, 1)[0] ?? null;
}
