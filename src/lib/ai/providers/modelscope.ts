/**
 * ModelScope API-Inference adapter — Revora's own ModelScope access token on
 * its free tier for registered users (about 2,000 requests a day, 500 per
 * model). Requires an Alibaba Cloud account with real-name verification.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const modelscopeAdapter = createOpenAiCompatibleAdapter({
  name: "modelscope",
  baseUrl: () => "https://api-inference.modelscope.cn/v1",
});
