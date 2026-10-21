/** Unit-test isolation: configured deployment credentials must never select a live provider. */
import { vi } from "vitest";

export const PROVIDER_TEST_ENV_KEYS = [
  "OPENAI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_AI_FREE_API_KEY", "GEMINI_API_KEY",
  "OPENAI_FREE_TIER_SHARING", "GOOGLE_AI_FREE_TIER", "FREE_AI_ENABLED", "FREE_AI_ONLY",
  "FREE_AI_PROVIDER_ORDER", "BUILDER_EXTERNAL_AI_ALLOWED", "AI_DEFAULT_PROVIDER", "AI_FALLBACK_PROVIDER",
  "AI_PAID_DAILY_CAP_USD", "CLOUDFLARE_AI_API_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
  "OPENROUTER_API_KEY", "GROQ_API_KEY", "NVIDIA_NIM_API_KEY", "NVIDIA_API_KEY", "LLM7_API_KEY",
  "MISTRAL_API_KEY", "Mistral", "HUGGINGFACE_API_KEY", "Huggingface", "HF_TOKEN",
  "DEEPSEEK_API_KEY", "Deepseek", "CEREBRAS_API_KEY", "Cerebras", "COHERE_API_KEY", "Cohere",
  "SAMBANOVA_API_KEY", "SAMBANOVA_FREE_TIER", "TOGETHER_API_KEY", "SILICONFLOW_API_KEY",
  "POLLINATIONS_API_KEY", "ZAI_API_KEY", "ZHIPU_API_KEY", "OLLAMA_API_KEY", "MODELSCOPE_API_KEY",
  "GITHUB_MODELS_TOKEN", "OVH_AI_FREE", "KILO_FREE", "OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY",
  "OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY",
] as const;

const KEYLESS_FLAGS = ["OVH_AI_FREE", "KILO_FREE"] as const;

export function isolateProviderEnvironment(): void {
  for (const key of PROVIDER_TEST_ENV_KEYS) vi.stubEnv(key, undefined);
  // Keyless tiers are on by default; tests switch them off like any other provider.
  for (const key of KEYLESS_FLAGS) vi.stubEnv(key, "false");
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("Unexpected HTTP request in AI unit test; configure a response stub first.");
  }));
}