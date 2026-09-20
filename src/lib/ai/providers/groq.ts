/**
 * Groq adapter — Revora's own Groq key on Groq's free developer tier.
 *
 * Groq serves an OpenAI-compatible wire format, so the shared adapter factory
 * handles it. Only models Revora has proven free-eligible in
 * `src/lib/ai/free.ts` can reach this adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const groqAdapter = createOpenAiCompatibleAdapter({
  name: "groq",
  baseUrl: () => "https://api.groq.com/openai/v1",
});
