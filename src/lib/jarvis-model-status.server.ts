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
