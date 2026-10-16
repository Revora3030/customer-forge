/**
 * Z.ai (Zhipu GLM) adapter — Revora's own Z.ai key, restricted to its
 * permanently free Flash models (an allowlist in `src/lib/ai/free.ts`):
 * GLM-4.7-Flash for text and GLM-4.6V-Flash for vision. One request at a time
 * per key. ZAI_BASE_URL can point at the mainland endpoint (open.bigmodel.cn).
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export function zaiBaseUrl() {
  const override = process.env["ZAI_BASE_URL"]?.trim();
  return override && /^https:\/\/(api\.z\.ai|open\.bigmodel\.cn)\/api\/paas\/v4\/?$/.test(override) ? override : "https://api.z.ai/api/paas/v4";
}

export const zaiAdapter = createOpenAiCompatibleAdapter({ name: "zai", baseUrl: zaiBaseUrl });
