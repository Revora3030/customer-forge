/**
 * Pollinations adapter — Revora's own Pollinations secret key (sk_) on its
 * OpenAI-compatible endpoint. Only text models Pollinations does not mark as
 * paid-only are used, and `src/lib/ai/free.ts` caps daily requests so the
 * free daily grant is never exceeded by Revora.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const pollinationsAdapter = createOpenAiCompatibleAdapter({
  name: "pollinations",
  baseUrl: () => "https://gen.pollinations.ai/v1",
});
