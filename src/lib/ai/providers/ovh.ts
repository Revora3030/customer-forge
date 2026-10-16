/**
 * OVHcloud AI Endpoints adapter — the free ANONYMOUS tier only (no key, 2
 * requests a minute per model). A key would switch to pay-as-you-go billing,
 * so Revora never sends one. EU-hosted.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const ovhAdapter = createOpenAiCompatibleAdapter({
  name: "ovh",
  baseUrl: () => "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
});
