/**
 * Helpers every provider adapter shares: turning a data URL into raw bytes,
 * mapping an HTTP failure onto Revora's own error categories, and reading a
 * provider's error body without ever echoing a key back into a log.
 */

import { RevoraAiError, categoryForStatus } from "@/lib/ai/errors";
import type { ProviderName } from "@/lib/ai/config";

export function base64FromDataUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function bytesFromDataUrl(dataUrl: string) {
  const binary = atob(base64FromDataUrl(dataUrl));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Approximate byte size of a base64 payload, without decoding it. */
export function base64ByteLength(dataUrl: string) {
  const base64 = base64FromDataUrl(dataUrl).replace(/=+$/, "");
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Provider failures become Revora errors here. The provider's own text is
 * truncated hard and never includes request headers, so a key can't leak into
 * an error message or a log line.
 */
export async function providerHttpError(
  provider: ProviderName,
  response: Response,
): Promise<RevoraAiError> {
  const detail = await response.text().catch(() => "");
  const retryAfter = Number(response.headers.get("retry-after")) || null;
  // Google answers a rejected key with 400, not 401. Treat a credential
  // rejection as unauthorized so the request moves on to the next provider
  // instead of being reported as a malformed request.
  const keyRejected = /API_KEY_INVALID|API key not valid|invalid[_ ]api[_ ]key/i.test(detail);
  const category = keyRejected ? "unauthorized" : categoryForStatus(response.status);

  const message =
    category === "rate_limited"
      ? "Revora AI is busy right now. Try again in a moment."
      : category === "quota" || category === "policy"
        ? `Revora's AI provider (${provider}) refused this request. Check the provider account for this workspace.`
        : category === "too_large"
          ? "That attachment is too large for Revora AI. Try a smaller file."
          : category === "invalid_request"
            ? "Revora AI could not process that request."
            : category === "unauthorized"
              ? `Revora's ${provider} AI credentials were rejected.`
              : `Revora's AI provider (${provider}) is temporarily unavailable.`;
  return new RevoraAiError(response.status, message, {
    category,
    retryAfterSeconds: retryAfter,
    provider,
    detail: detail.slice(0, 300),
  });
}
