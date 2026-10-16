/**
 * SambaNova Cloud adapter — Revora's own SambaNova key on its free tier.
 *
 * SambaNova serves an OpenAI-compatible wire format; temperatures above 1 are
 * rejected, so requests are clamped. Free-tier limits are small (about 20
 * requests a day), so `src/lib/ai/free.ts` caps daily use to match.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const sambanovaAdapter = createOpenAiCompatibleAdapter({
  name: "sambanova",
  baseUrl: () => "https://api.sambanova.ai/v1",
  maxTemperature: 1,
});
