/**
 * SiliconFlow adapter — Revora's own SiliconFlow key, restricted to the small
 * models SiliconFlow serves for free (an allowlist in `src/lib/ai/free.ts`;
 * its model list does not say which are free, so nothing else is used).
 *
 * Keys are issued per region: international keys use api.siliconflow.com and
 * mainland China keys use api.siliconflow.cn. SILICONFLOW_BASE_URL overrides.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export function siliconflowBaseUrl() {
  const override = process.env["SILICONFLOW_BASE_URL"]?.trim();
  return override && /^https:\/\/api\.siliconflow\.(com|cn)\/v1\/?$/.test(override) ? override : "https://api.siliconflow.com/v1";
}

export const siliconflowAdapter = createOpenAiCompatibleAdapter({
  name: "siliconflow",
  baseUrl: siliconflowBaseUrl,
});
