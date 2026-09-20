/**
 * Cloudflare Workers AI adapter — Revora's own Cloudflare account token,
 * called through Cloudflare's OpenAI-compatible endpoint.
 *
 * Workers Free includes a daily Neuron allowance, so the models Revora selects
 * here (see `src/lib/ai/free.ts`) cost nothing to run. The account id is read
 * from the server environment at call time, never bundled.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const cloudflareAdapter = createOpenAiCompatibleAdapter({
  name: "cloudflare",
  baseUrl: () => {
    const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
    if (!accountId) return null;
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  },
});
