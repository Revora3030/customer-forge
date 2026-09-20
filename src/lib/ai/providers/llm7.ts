/**
 * LLM7.io adapter — Revora's own LLM7 key on its free (non usage-based) tier.
 *
 * LLM7 serves an OpenAI-compatible wire format, so the shared adapter factory
 * handles it. Only models Revora has proven free-eligible in
 * `src/lib/ai/free.ts` can reach this adapter: LLM7 also hosts usage-based
 * (paid-balance) models on the same endpoint, and those are rejected there.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const llm7Adapter = createOpenAiCompatibleAdapter({
  name: "llm7",
  baseUrl: () => "https://api.llm7.io/v1",
});
