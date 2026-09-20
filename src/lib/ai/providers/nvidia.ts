/**
 * NVIDIA NIM adapter — Revora's own NVIDIA key on the free developer allowance.
 *
 * NIM serves an OpenAI-compatible wire format, so the shared adapter factory
 * handles it. Only models Revora has proven free-eligible in
 * `src/lib/ai/free.ts` can reach this adapter.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const nvidiaAdapter = createOpenAiCompatibleAdapter({
  name: "nvidia",
  baseUrl: () => "https://integrate.api.nvidia.com/v1",
});
