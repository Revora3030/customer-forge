/**
 * Ollama Cloud adapter — Revora's own Ollama key on its free tier (session
 * and weekly usage limits). Ollama's OpenAI-compatible endpoint serves its
 * cloud models (DeepSeek V4, Kimi, Qwen3.5 397B, gpt-oss).
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const ollamaAdapter = createOpenAiCompatibleAdapter({ name: "ollama", baseUrl: () => "https://ollama.com/v1" });
