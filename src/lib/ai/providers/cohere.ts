/**
 * Cohere adapter — Revora's own Cohere key on the trial API tier.
 *
 * Cohere's v2 chat API serves an OpenAI-compatible wire format. Only models
 * Revora has proven free-eligible in `src/lib/ai/free.ts` can reach this
 * adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const cohereAdapter = createOpenAiCompatibleAdapter({
  name: "cohere",
  // Cohere's OpenAI-compatible chat lives under /compatibility/v1; the native
  // /v2 API has a different shape, so every call there answered 404.
  baseUrl: () => "https://api.cohere.ai/compatibility/v1",
});
