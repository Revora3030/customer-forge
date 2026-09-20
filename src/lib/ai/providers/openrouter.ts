/**
 * OpenRouter adapter — Revora's own OpenRouter key, restricted to the
 * provider's free model pool.
 *
 * Only model ids OpenRouter marks free (`:free`, or the free auto router) can
 * reach this adapter; `src/lib/ai/free.ts` enforces that before a call is made,
 * so a paid OpenRouter model can never be selected by the free router.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const openRouterAdapter = createOpenAiCompatibleAdapter({
  name: "openrouter",
  baseUrl: () => "https://openrouter.ai/api/v1",
  extraHeaders: () => {
    const referer = process.env["OPENROUTER_SITE_URL"]?.trim() || "https://revoragrowthsystems.com";
    return { "http-referer": referer, "x-title": "Revora Growth Systems" };
  },
});
