/**
 * The owner's own self-hosted OpenAI-compatible gateway (LiteLLM, vLLM, or an
 * Ollama/ComfyUI box exposed through one). Off until SELFHOSTED_AI_BASE_URL
 * (public https only) and SELFHOSTED_AI_API_KEY are set; only models listed in
 * SELFHOSTED_AI_FREE_MODELS are ever selected.
 */
import { safeOmniRouteBaseUrl } from "@/lib/ai/omniroute-url";
import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export const selfhostedAdapter = createOpenAiCompatibleAdapter({
  name: "selfhosted",
  baseUrl: () => safeOmniRouteBaseUrl(process.env["SELFHOSTED_AI_BASE_URL"]),
});
