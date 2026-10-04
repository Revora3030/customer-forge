/**
 * Free-provider eligibility and budgeting.
 *
 * This module defines which provider/model combinations are eligible for a
 * provider's free allowance and how that lane is budgeted. It is NOT a website
 * builder, creative planner, or design fallback. The main model router remains
 * responsible for quality-first selection and the AI collective remains the
 * creative authority.
 *
 * Every value is read from the server environment at call time. Server-only:
 * never import this from a component.
 */

import type { ModelRole, ProviderName } from "@/lib/ai/config";

export type FreeProviderName =
  | "openai"
  | "cloudflare"
  | "groq"
  | "nvidia"
  | "llm7"
  | "openrouter"
  | "google"
  | "mistral"
  | "huggingface"
  | "deepseek"
  | "cerebras"
  | "cohere";

export const FREE_PROVIDERS: FreeProviderName[] = [
  "openai",
  "cloudflare",
  "groq",
  "nvidia",
  "llm7",
  "openrouter",
  "google",
  "mistral",
  "huggingface",
  "deepseek",
  "cerebras",
  "cohere",
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
  openai: {
    label: "OpenAI shared-traffic daily allowance",
    allowance:
      "Free daily usage on traffic shared with OpenAI: 250,000 tokens/day across the flagship models (gpt-5.4, gpt-5.2, gpt-5.1, gpt-5, gpt-4.1, gpt-4o, o1, o3) and 2,500,000 tokens/day across the mini/nano models. Usage beyond those limits is billed at standard rates.",
    // Tokens, not requests, are what OpenAI meters here. Revora keeps its own
    // conservative daily request guard so one workspace cannot burn the whole
    // shared allowance before the rest of the day's builds run.
    dailyRequestCap: 600,
  },

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
  mistral: {
    label: "Mistral AI Experiment plan",
    allowance: "Free Experiment plan: limited tokens/month for Mistral Small, Ministral 3B, NeMo, and Codestral (non-commercial).",
    dailyRequestCap: null,
  },
  huggingface: {
    label: "Hugging Face Serverless Inference",
    allowance: "Free tier: small monthly credit for signed-in users to test thousands of models.",
    dailyRequestCap: null,
  },
  deepseek: {
    label: "DeepSeek API free tier",
    allowance: "Free developer tier: rate-limited access to DeepSeek V4 Flash and R1 reasoning models.",
    dailyRequestCap: null,
  },
  cerebras: {
    label: "Cerebras free inference",
    allowance: "Free tier: ultra-fast inference on Llama and Qwen models with rate limits.",
    dailyRequestCap: null,
  },
  cohere: {
    label: "Cohere trial API",
    allowance: "Trial keys: free until rate limits reached for Command A+, North, and Embed models.",
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
  // OpenAI's shared-traffic allowance, on Revora's own OpenAI key. Only the
  // models OpenAI names in that allowance are listed, so nothing here can be
  // billed while the allowance lasts. Pictures, video and transcription are NOT
  // covered by it, so those roles are deliberately absent.
  openai: {
    primary: "gpt-5.4",
    design: "gpt-5.4",
    fast: "gpt-5.4-mini",
    coding: "gpt-5.4",
    vision: "gpt-4o",
    conversation: "gpt-5.4-mini",
  },

  // Verified against Cloudflare's live Workers AI catalogue; live discovery can
  // widen this, and every id is still re-checked for free eligibility.
  cloudflare: {
    primary: "@cf/openai/gpt-oss-120b",
    design: "@cf/openai/gpt-oss-120b",
    fast: "@cf/meta/llama-3.2-3b-instruct",
    coding: "@cf/qwen/qwen2.5-coder-32b-instruct",
    vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
    // FLUX.2 [klein] 4B: Black Forest Labs' current distilled generator. Much
    // cleaner hands, materials and (crucially) far less smeared pseudo-text than
    // FLUX.1 schnell, at ~26 Neurons per 1024px frame — well inside the 10,000
    // Neuron free daily allocation. FLUX.1 schnell stays as the first backup.
    image: "@cf/black-forest-labs/flux-2-klein-4b",
    conversation: "@cf/openai/gpt-oss-120b",
  },
  // Verified live against Groq's free developer-tier catalogue. Groq serves no
  // multimodal model to this key, so `vision` is deliberately absent and the
  // router moves on to a provider that can read pictures.
  groq: {
    primary: "openai/gpt-oss-120b",
    design: "openai/gpt-oss-120b",
    fast: "openai/gpt-oss-20b",
    coding: "qwen/qwen3.8-27b",
    conversation: "openai/gpt-oss-120b",
  },
  // Verified live against this NVIDIA key's hosted NIM catalogue. Only these
  // answered; several listed ids are retired or not served to this account.
  // Every dedicated code model in the catalogue (codestral, codegemma,
  // codellama, granite-code, starcoder, deepseek-coder) answered 404 for this
  // key, so `coding` deliberately reuses the general model rather than naming a
  // model the account cannot invoke.
  nvidia: {
    primary: "nvidia/nemotron-3-super-120b-a12b",
    design: "nvidia/nemotron-3-super-120b-a12b",
    fast: "nvidia/nemotron-3.5-lightning-30b-a3b",
    coding: "nvidia/nemotron-3-super-120b-a12b",
    vision: "meta/llama-3.2-11b-vision-instruct",
    conversation: "nvidia/nemotron-3-super-120b-a12b",
  },
  // Verified live against LLM7's catalogue: only its non usage-based (free)
  // chat models. LLM7 serves no free multimodal model, so `vision` is absent
  // and the router moves on to a provider that can read pictures.
  // Expanded with GLM-5.3-Flash and minimax-m2.7 from the verified free list.
  llm7: {
    primary: "codestral-latest",
    design: "mistral-Nemo-Instruct-2407",
    fast: "mistral-Nemo-Instruct-2407",
    coding: "codestral-latest",
    conversation: "GLM-5.3-Flash",
  },
  // Verified live against OpenRouter's zero-price pool. `openrouter/free` is
  // its free auto-router, so it survives individual models being retired.
  openrouter: {
    primary: "nvidia/nemotron-3-super-120b-a12b:free",
    design: "nvidia/nemotron-3-super-120b-a12b:free",
    fast: "openrouter/free",
    coding: "cohere/north-mini-code:free",
    vision: "inclusionai/ling-3.0-flash-vl:free",
    conversation: "openrouter/free",
  },
  // Verified live against the Gemini free-tier catalogue; the 2.5 line is no
  // longer served to new keys, so the current flash/flash-lite class is used.
  // `transcription` was verified live with real audio on the free tier. Gemini's
  // image models are NOT included: every one of them answers 429 "quota
  // exceeded" on the free tier, so image generation stays an unserved role.
  google: {
    primary: "gemini-3.8-flash",
    design: "gemini-3.8-flash",
    fast: "gemini-3.5-flash-lite",
    coding: "gemini-3.8-flash",
    vision: "gemini-3.8-flash",
    transcription: "gemini-3.5-transcribe",
    conversation: "gemini-3.8-flash",
  },
  mistral: {
    primary: "mistral-small-latest",
    design: "mistral-small-latest",
    fast: "ministral-3b-latest",
    coding: "codestral-latest",
    conversation: "ministral-3b-latest",
  },
  huggingface: {
    primary: "meta-llama/Llama-3.3-70B-Instruct",
    design: "meta-llama/Llama-3.3-70B-Instruct",
    fast: "meta-llama/Llama-3.1-8B-Instruct",
    coding: "Qwen/Qwen2.5-Coder-32B-Instruct",
    vision: "Qwen/Qwen2.5-VL-72B-Instruct",
    conversation: "meta-llama/Llama-3.1-8B-Instruct",
  },
  deepseek: {
    primary: "deepseek-flash",
    design: "deepseek-flash",
    fast: "deepseek-flash",
    coding: "deepseek-v4-pro",
    conversation: "deepseek-flash",
  },
  cerebras: {
    primary: "gpt-oss-120b",
    design: "gpt-oss-120b",
    fast: "gpt-oss-120b",
    coding: "qwen-3.8-27b",
    conversation: "gpt-oss-120b",
  },
  cohere: {
    primary: "command-a-plus-05-2026",
    design: "command-a-plus-05-2026",
    fast: "command-r7b-12-2024",
    coding: "north-mini-code",
    conversation: "command-a-plus-05-2026",
  },
};

/**
 * Roles with no eligible free provider are reported as unavailable by the free
 * lane. The main router may still use a configured paid specialist; this module
 * never chooses a creative substitute.
 *
 * Image generation is no longer here: Cloudflare Workers AI serves
 * `@cf/black-forest-labs/flux-2-klein-4b` (primary) and
 * `@cf/black-forest-labs/flux-1-schnell` (backup) inside the free Neuron
 * allowance. Gemini's image models are still refused
 * on the free tier, so Google keeps no image entry above.
 */
export const FREE_UNSERVED_ROLES: ModelRole[] = [];

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
 * Models that are not text generation at all, wherever they are hosted:
 * safety/guard classifiers, embedders, rerankers, speech models and the LoRA
 * adapter variants Cloudflare lists alongside real models. Live discovery would
 * otherwise offer one of these as a writer and waste a request on a useless
 * answer, so they are rejected for every provider that has no stricter filter.
 */
/**
 * Cloudflare picture models that are too expensive for the free Neuron
 * allocation to carry a whole site campaign. Leonardo charges ~530-636 Neurons
 * per tile, FLUX.2 [dev] ~37.5 Neurons per output tile PER STEP, and FLUX.2
 * [klein] 9B ~1,364 Neurons for the first megapixel — one site's worth of
 * frames would spend the day's allocation. They are rejected for every role.
 *
 * FLUX.2 [klein] 4B is deliberately NOT here: Cloudflare publishes it at 26.05
 * Neurons per output 512px tile (~105 Neurons for a 1024x1024 frame), which is
 * about 95 full-resolution pictures per day inside the free 10,000 Neurons.
 */
const CLOUDFLARE_PAID_MODEL = /leonardo|flux-2-dev|flux-2-klein-9b|flux-2-(?!klein-4b)/i;

/** Cloudflare models that take multipart form data instead of a JSON body. */
export function cloudflareMultipartImageModel(model: string) {
  return /flux-2/i.test(model);
}

const NON_CHAT_MODEL =
  /guard|safety|safeguard|moderation|embed|rerank|retriev|whisper|orpheus|\btts\b|-lora\b|lora$|classifier/i;

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

/**
 * The exact models OpenAI covers with its shared-traffic daily allowance. An
 * exact-match allowlist on purpose: every other OpenAI model is billed, and a
 * pattern would eventually let one of those into a free-only chain.
 */
const OPENAI_SHARED_TRAFFIC_FREE = new Set(
  [
    // 250,000 tokens/day pool
    "gpt-5.4",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-4.1",
    "gpt-4o",
    "o1",
    "o3",
    // 2,500,000 tokens/day pool
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o-mini",
    "o3-mini",
    "o4-mini",
  ].map((id) => id.toLowerCase()),
);

/** Is this model inside OpenAI's shared-traffic daily allowance? */
export function openAiSharedTrafficFree(model: string) {
  return OPENAI_SHARED_TRAFFIC_FREE.has(model.trim().toLowerCase());
}

/** The shared-traffic allowance ids, for the admin surface. */
export function openAiSharedTrafficModels(): string[] {
  return [...OPENAI_SHARED_TRAFFIC_FREE];
}

export function isFreeEligibleModel(provider: FreeProviderName, model: string): boolean {
  const name = model.trim();
  if (name.length === 0) return false;
  // OpenAI is a free provider ONLY for the ids its shared-traffic allowance
  // covers, so this is checked before the generic paid-name rules below (which
  // reject every `gpt-`/`o<n>` name).
  if (provider === "openai") return openAiSharedTrafficFree(name);
  const unprefixed = provider === "groq" ? name.replace(/^openai\/(?=gpt-oss)/i, "") : name;
  if (PAID_MODEL_PATTERNS.some((pattern) => pattern.test(unprefixed))) {
    // Groq's free tier serves gpt-oss models under the openai/ namespace.
    // DeepSeek's free tier serves deepseek-chat and deepseek-coder directly.
    // Both would otherwise be rejected by the paid-name patterns above.
    const groqException = provider === "groq" && /^gpt-oss/i.test(unprefixed);
    const deepseekException =
      provider === "deepseek" && /^(deepseek-flash|deepseek-v4-pro|deepseek-chat|deepseek-coder|deepseek-reasoner)/i.test(unprefixed);
    if (!groqException && !deepseekException) return false;
  }

  if (provider === "openrouter") return openRouterFree(name) && !NON_CHAT_MODEL.test(name);
  if (provider === "google") return /flash|lite|gemma|transcribe/i.test(name);
  if (provider === "groq") return groqFreeEligible(name);
  if (provider === "nvidia") return nvidiaFreeEligible(name);
  if (provider === "llm7") return llm7FreeEligible(name);
  if (provider === "mistral")
    return /^(mistral-small|mistral-nemo|codestral|ministral-3b|open-mistral|open-mixtral)/i.test(name);
  // Hugging Face hosts every kind of model; only chat generators may write.
  if (provider === "huggingface") return name.includes("/") && !NON_CHAT_MODEL.test(name);
  if (provider === "deepseek")
    return /^(deepseek-flash|deepseek-v4-pro|deepseek-chat|deepseek-reasoner|deepseek-coder)/i.test(name);
  if (provider === "cerebras")
    return /^(gpt-oss|qwen|llama|deepseek)/i.test(name);
  if (provider === "cohere")
    // Embed models turn text into numbers; they can never write an answer.
    return /^(command|north|c4ai-aya)/i.test(name) && !NON_CHAT_MODEL.test(name);
  // Cloudflare's catalogue also carries partner image models that are billed
  // per tile/step (Leonardo) or carry partner pricing Revora has not verified as
  // free (the flux-2 line). Those are rejected by name so neither a default nor
  // live discovery can put a billed model in a free-only chain.
  if (CLOUDFLARE_PAID_MODEL.test(name)) return false;
  return name.startsWith("@cf/") && !NON_CHAT_MODEL.test(name);
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
  if (provider === "openai") {
    // The allowance only exists while "share traffic with OpenAI" is on for the
    // key's project. It is on for this account, and an operator can switch the
    // free lane off with OPENAI_FREE_TIER_SHARING=false if that ever changes.
    if (env("OPENAI_FREE_TIER_SHARING")?.toLowerCase() === "false") return null;
    const apiKey = env("OPENAI_API_KEY");
    return apiKey ? { apiKey } : null;
  }
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
  if (provider === "llm7") {
    const apiKey = env("LLM7_API_KEY");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "mistral") {
    const apiKey = env("MISTRAL_API_KEY") ?? env("Mistral");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "huggingface") {
    const apiKey = env("HUGGINGFACE_API_KEY") ?? env("Huggingface") ?? env("HF_TOKEN");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "deepseek") {
    const apiKey = env("DEEPSEEK_API_KEY") ?? env("Deepseek");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "cerebras") {
    const apiKey = env("CEREBRAS_API_KEY") ?? env("Cerebras");
    return apiKey ? { apiKey } : null;
  }
  if (provider === "cohere") {
    const apiKey = env("COHERE_API_KEY") ?? env("Cohere");
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
  // OpenAI's shared-traffic allowance first: it is the strongest free pool
  // available to this account, and it costs nothing until the daily token
  // allowance is used up, after which OpenAI's own limits push the chain on.
  "openai",
  "cloudflare",
  "groq",
  "nvidia",
  "llm7",
  "openrouter",
  "google",
  "mistral",
  "huggingface",
  "deepseek",
  "cerebras",
  "cohere",
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
 * AI is available right now" — the caller then falls back to paid providers.
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
      models: (
        ["primary", "design", "fast", "coding", "vision", "image", "transcription", "conversation"] as ModelRole[]
      )
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

/**
 * Today's request cap for a provider: the operator override when set, otherwise
 * the allowance the provider publishes. `null` means the provider publishes no
 * daily request cap. Exported so the shared (cross-worker) counters can be
 * measured against exactly the same number as the in-process ones.
 */
export function freeBudgetCap(provider: FreeProviderName): number | null {
  const override = Number(env(`FREE_AI_${provider.toUpperCase()}_DAILY_CAP`));
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return FREE_ALLOWANCE[provider].dailyRequestCap;
}

function budgetCap(provider: FreeProviderName) {
  return freeBudgetCap(provider);
}

export function freeBudgetRemaining(provider: FreeProviderName): number | null {
  const cap = budgetCap(provider);
  if (cap === null) return null;
  const entry = budget.get(provider);
  const used = entry && entry.day === today() ? entry.used : 0;
  return Math.max(0, cap - used);
}

export function freeBudgetAllows(provider: FreeProviderName, role?: ModelRole) {
  // Picture requests have their own allowance. They must not also consume the
  // text allowance or one image campaign can starve copy and planning work.
  if (role === "image") return freeImageBudgetAllows(provider);
  const remaining = freeBudgetRemaining(provider);
  return remaining === null || remaining > 0;
}

export function noteFreeUse(provider: FreeProviderName, role?: ModelRole) {
  const day = today();
  const keys = role === "image" ? [freeImageBudgetKey(provider)] : [provider];
  for (const key of keys) {
    const entry = budget.get(key);
    budget.set(key, entry && entry.day === day ? { day, used: entry.used + 1 } : { day, used: 1 });
  }
}

/* --------------------------- free image allowance --------------------------- */

/**
 * Pictures are metered differently from words. Cloudflare Workers AI includes a
 * daily Neuron allowance on the free plan, and one generated picture costs far
 * more Neurons than one short answer — so Revora keeps its own conservative
 * daily picture cap in front of it. Once the cap is reached, picture-making is
 * reported as temporarily unavailable rather than quietly spending money.
 *
 * Override with `FREE_AI_IMAGE_DAILY_CAP` (all providers) or
 * `FREE_AI_<PROVIDER>_IMAGE_DAILY_CAP` (one provider).
 */
// ~105 Neurons per FLUX.2 [klein] 4B frame, so 60 frames is ~6,300 Neurons and
// leaves the rest of the 10,000 daily Neurons for copy and review calls.
const DEFAULT_IMAGE_DAILY_CAP = 60;

export function freeImageBudgetKey(provider: FreeProviderName) {
  return `${provider}#image`;
}

export function freeImageBudgetCap(provider: FreeProviderName): number {
  const specific = Number(env(`FREE_AI_${provider.toUpperCase()}_IMAGE_DAILY_CAP`));
  if (Number.isFinite(specific) && specific > 0) return Math.floor(specific);
  const shared = Number(env("FREE_AI_IMAGE_DAILY_CAP"));
  if (Number.isFinite(shared) && shared > 0) return Math.floor(shared);
  return DEFAULT_IMAGE_DAILY_CAP;
}

export function freeImageBudgetRemaining(provider: FreeProviderName): number {
  const entry = budget.get(freeImageBudgetKey(provider));
  const used = entry && entry.day === today() ? entry.used : 0;
  return Math.max(0, freeImageBudgetCap(provider) - used);
}

export function freeImageBudgetAllows(provider: FreeProviderName) {
  return freeImageBudgetRemaining(provider) > 0;
}

/**
 * Which Cloudflare image models can change an existing picture rather than only
 * make a new one. Editing needs an image-to-image or inpainting model, so the
 * builder only offers "edit this picture" when such a model is actually selected
 * — never by assuming a text-to-image model can do it.
 */
export function imageEditCapableModel(model: string) {
  return /img2img|image-to-image|inpaint/i.test(model);
}

/**
 * Models dedicated to inpainting or image-to-image work require source pixels
 * and cannot satisfy a fresh text-to-image request. Keep them out of new-image
 * routing even when catalogue discovery broadly labels them as image models.
 */
export function imageCreationCapableModel(model: string) {
  return !imageEditCapableModel(model);
}

/** Test and operations helper: clears the in-process budget counters. */
export function resetFreeBudget() {
  budget.clear();
}
