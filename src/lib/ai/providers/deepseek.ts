/**
 * DeepSeek adapter — Revora's own DeepSeek key on the free developer tier.
 *
 * DeepSeek serves an OpenAI-compatible wire format. Only models Revora has
 * proven free-eligible in `src/lib/ai/free.ts` can reach this adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const deepseekAdapter = createOpenAiCompatibleAdapter({
  name: "deepseek",
  baseUrl: () => "https://api.deepseek.com/v1",
});
