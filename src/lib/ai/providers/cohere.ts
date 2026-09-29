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
  baseUrl: () => "https://api.cohere.ai/v2",
});
