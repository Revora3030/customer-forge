/**
 * Together AI adapter — Revora's own Together key, restricted to models
 * Together serves for free (ids ending in "-Free", or priced at zero in its
 * live catalogue). Every other Together model is billed and is rejected by
 * `src/lib/ai/free.ts` before a call can be made.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const togetherAdapter = createOpenAiCompatibleAdapter({
  name: "together",
  baseUrl: () => "https://api.together.xyz/v1",
});
