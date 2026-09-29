/**
 * Cerebras adapter — Revora's own Cerebras key on the free inference tier.
 *
 * Cerebras serves an OpenAI-compatible wire format with ultra-fast
 * token generation. Only models Revora has proven free-eligible in
 * `src/lib/ai/free.ts` can reach this adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const cerebrasAdapter = createOpenAiCompatibleAdapter({
  name: "cerebras",
  baseUrl: () => "https://api.cerebras.ai/v1",
});
