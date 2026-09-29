/**
 * Hugging Face adapter — Revora's own HF token on the free serverless
 * inference tier.
 *
 * Hugging Face's router.serve.app endpoints serve an OpenAI-compatible wire
 * format. Only models Revora has proven free-eligible in `src/lib/ai/free.ts`
 * can reach this adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const huggingfaceAdapter = createOpenAiCompatibleAdapter({
  name: "huggingface",
  baseUrl: () =>
    process.env["HUGGINGFACE_BASE_URL"]?.trim() ||
    "https://router.huggingface.co/v1",
});
