/**
 * OpenCode Zen adapter — Revora's own OpenCode key. Only ids ending in "-free"
 * are unbilled; `src/lib/ai/free.ts` rejects every other id before a call.
 */
import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const opencodeAdapter = createOpenAiCompatibleAdapter({
  name: "opencode",
  baseUrl: () => "https://opencode.ai/zen/v1",
});
