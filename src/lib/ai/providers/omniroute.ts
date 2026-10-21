/**
 * The owner's own self-hosted OmniRoute server (OpenAI-compatible router).
 * Off until both OMNIROUTE_BASE_URL and OMNIROUTE_API_KEY are set. The base
 * URL must be public https so a misconfiguration can never point the server
 * at internal addresses.
 */

import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Normalised https base URL (no trailing slash), or null when unsafe/invalid. */
export function safeOmniRouteBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (PRIVATE_HOST.test(url.hostname)) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

export function omniRouteBaseUrl(): string | null {
  return safeOmniRouteBaseUrl(process.env["OMNIROUTE_BASE_URL"]);
}

export const omnirouteAdapter = createOpenAiCompatibleAdapter({ name: "omniroute", baseUrl: omniRouteBaseUrl });
