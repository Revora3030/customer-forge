/**
 * GitHub Models adapter — Revora's own GitHub token (models:read) on GitHub's
 * free, rate-limited tier. GitHub positions that tier for prototyping, so the
 * router uses it only for Revora's own admin work (Jarvis), never for
 * customer sites. Only an allowlist of OpenAI models is used.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const githubModelsAdapter = createOpenAiCompatibleAdapter({
  name: "github",
  baseUrl: () => "https://models.github.ai/inference",
});
