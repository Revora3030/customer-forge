/**
 * The owner's own self-hosted OmniRoute server (OpenAI-compatible router).
 * Off until both OMNIROUTE_BASE_URL and OMNIROUTE_API_KEY are set. The base
 * URL must be public https so a misconfiguration can never point the server
 * at internal addresses.
 */

import { safeOmniRouteBaseUrl } from "@/lib/ai/omniroute-url";
import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

export function omniRouteBaseUrl(): string | null {
  return safeOmniRouteBaseUrl(process.env["OMNIROUTE_BASE_URL"]);
}

export const omnirouteAdapter = createOpenAiCompatibleAdapter({ name: "omniroute", baseUrl: omniRouteBaseUrl });
