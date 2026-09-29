/**
 * Mistral AI adapter — Revora's own Mistral key on the free Experiment plan.
 *
 * Mistral serves an OpenAI-compatible wire format. Only models Revora has
 * proven free-eligible in `src/lib/ai/free.ts` can reach this adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const mistralAdapter = createOpenAiCompatibleAdapter({
  name: "mistral",
  baseUrl: () => "https://api.mistral.ai/v1",
});
