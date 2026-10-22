/**
 * Helpers every provider adapter shares: turning a data URL into raw bytes,
 * mapping an HTTP failure onto Revora's own error categories, and reading a
 * provider's error body without ever echoing a key back into a log.
 */

import { RevoraAiError, categoryForStatus } from "@/lib/ai/errors";
import { BILLING_EXHAUSTED_TEXT } from "@/lib/ai/provider-backoff";
import type { ProviderName } from "@/lib/ai/config";

/** Provider wording for "the conversation doesn't fit this model's context". */
export const CONTEXT_TOO_LONG_TEXT =
  /context[_ ]length|maximum context|context window|too many (?:input )?tokens|reduce the length|prompt is too long|input is too long|exceeds? the (?:model'?s? )?(?:maximum|max)(?:imum)? (?:context|token|input)|request too large/i;

/** Provider wording for "this model id is retired or not served to this key". */
export const MODEL_MISSING_TEXT =
  /model[^"]{0,40}(not found|does not exist|not available|unknown|decommission|deprecat)|no such model|invalid model/i;

/**
 * Provider wording for a model that needs a one-time licence acceptance on the
 * account first (Workers AI's Meta Llama vision models answer 403 until the
 * prompt "agree" has been submitted once). Every call fails the same way.
 */
export const MODEL_LICENCE_TEXT =
  /submit the prompt ['"]?agree|licen[cs]e agreement|accept the (?:model'?s? )?licen[cs]e|agree to the (?:model'?s? )?licen[cs]e/i;

/**
 * True when a failure says this one model can never answer this account (a
 * retired id, a 404, or a licence that was never accepted) — a fact about the
 * model, not the provider and not a busy moment.
 */
export function modelUnavailableError(error: RevoraAiError): boolean {
  const detail = error.detail ?? "";
  if (error.category === "bad_response")
    return error.status !== 429 && error.status < 500 && (error.status === 404 || MODEL_MISSING_TEXT.test(detail));
  if (error.category === "policy") return MODEL_LICENCE_TEXT.test(detail);
  return false;
}

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
  // A 404 means this one model id is retired or not served to this key. That
  // is a fact about the model, not an outage: it must not be retried or bench
  // the provider, and the next model in the pool should answer instead.
  const modelMissing = response.status === 404 || MODEL_MISSING_TEXT.test(detail);
  // "Out of credit" is often sent as 429 or 400 (OpenAI insufficient_quota).
  // It is an account fact, not a busy moment: classify it as quota so the
  // provider is skipped and backed off instead of retried.
  const billingExhausted = response.status !== 401 && BILLING_EXHAUSTED_TEXT.test(detail);
  // Most providers report an over-long conversation as a plain 400. It is a
  // fact about this model's context window, so it is "too_large": the router
  // then hands a shortened conversation to the next free model.
  const contextTooLong = [400, 413, 422].includes(response.status) && CONTEXT_TOO_LONG_TEXT.test(detail);
  const category = keyRejected
    ? "unauthorized"
    : billingExhausted
      ? "quota"
    : contextTooLong
      ? "too_large"
    : modelMissing && response.status !== 429 && response.status < 500
      ? "bad_response"
      : categoryForStatus(response.status);

  const message =
    category === "rate_limited"
      ? "Revora AI is busy right now. Try again in a moment."
      : category === "quota" || category === "policy"
        ? `Revora's AI provider (${provider}) refused this request. Check the provider account for this workspace.`
        : category === "too_large"
          ? contextTooLong
            ? "That conversation is too long for this AI model."
            : "That attachment is too large for Revora AI. Try a smaller file."
          : category === "invalid_request"
            ? "Revora AI could not process that request."
            : category === "bad_response"
              ? `Revora's ${provider} model is not available right now.`
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
