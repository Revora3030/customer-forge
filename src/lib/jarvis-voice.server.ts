/**
 * The one place that calls ElevenLabs. Used by the buffered server function and
 * by the streaming route, so both share the voice, model and error messages.
 */

export const VOICE_MAX_BYTES = 1_500_000;
/** At most this much of an ElevenLabs error body is read before the rest is cancelled. */
export const ERROR_BODY_MAX_BYTES = 2048;

/**
 * The single source of the ElevenLabs key and voice. The key is also the HMAC
 * secret for signed voice links, so every signer and verifier must read it
 * here (trimmed), never from process.env directly.
 */
export function voiceConfig() {
  const apiKey = process.env["ELEVENLABS_API_KEY"]?.trim();
  if (!apiKey) throw new Error("ElevenLabs is not configured on the server. Add ELEVENLABS_API_KEY to the server runtime secrets.");
  const voiceId = process.env["ELEVENLABS_VOICE_ID"]?.trim() || "JBFqnCBsd6RMkjVDRZzb";
  if (!/^[a-zA-Z0-9_-]{5,100}$/.test(voiceId)) throw new Error("The configured ElevenLabs voice ID is invalid.");
  return { apiKey, voiceId };
}

export type ElevenLabsFailureCode =
  | "redirect_refused"
  | "quota_exceeded"
  | "detected_unusual_activity"
  | "invalid_api_key"
  | "missing_permissions"
  | "voice_not_found"
  | "payment_required"
  | "invalid_request"
  | "too_many_concurrent_requests"
  | "rate_limited"
  | "unauthorized"
  | "upstream_error"
  | "timeout"
  | "unreachable"
  | "bad_response"
  | "http_error";

export class ElevenLabsError extends Error {
  readonly status: number;
  readonly code: ElevenLabsFailureCode;
  constructor(status: number, code: ElevenLabsFailureCode, message: string) {
    super(message);
    this.name = "ElevenLabsError";
    this.status = status;
    this.code = code;
  }
}

/** The `detail.status` ElevenLabs puts in its JSON error bodies, when there is one. */
function detailStatus(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { detail?: unknown };
    const detail = parsed?.detail;
    if (detail && typeof detail === "object" && "status" in detail) {
      const status = (detail as { status?: unknown }).status;
      return typeof status === "string" ? status.toLowerCase() : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Turns an ElevenLabs error response into a plain reason for the owner. Pure:
 * reads only the status and the (already truncated) body, never the text that
 * was being spoken.
 */
export function describeElevenLabsFailure(status: number, bodyText: string): { code: ElevenLabsFailureCode; message: string } {
  if (status >= 300 && status < 400) return { code: "redirect_refused", message: `ElevenLabs redirect refused (HTTP ${status}).` };
  const detail = detailStatus(bodyText);
  const raw = bodyText.toLowerCase();
  const has = (value: string) => detail === value || raw.includes(value);
  if (has("quota_exceeded")) return { code: "quota_exceeded", message: "ElevenLabs character quota is used up. Add characters or wait for the plan to renew." };
  if (has("detected_unusual_activity"))
    return { code: "detected_unusual_activity", message: "ElevenLabs blocked this server (free plans can't be used from cloud servers). A paid ElevenLabs plan is needed." };
  if (has("invalid_api_key")) return { code: "invalid_api_key", message: "ElevenLabs says the API key was rejected. Check ELEVENLABS_API_KEY." };
  if (has("missing_permissions")) return { code: "missing_permissions", message: "ElevenLabs says the key is missing a permission (text to speech or voices)." };
  if (has("voice_not_found") || status === 404)
    return { code: "voice_not_found", message: "ElevenLabs can't find the configured voice. Check ELEVENLABS_VOICE_ID." };
  if (status === 402 || has("payment_required")) return { code: "payment_required", message: "ElevenLabs needs a paid plan or payment." };
  if (status === 422) return { code: "invalid_request", message: "ElevenLabs said invalid request." };
  if (status === 429)
    return has("too_many_concurrent_requests")
      ? { code: "too_many_concurrent_requests", message: "ElevenLabs is handling too many requests at once for this plan. Try again in a moment." }
      : { code: "rate_limited", message: "ElevenLabs rate limit reached. Try again shortly." };
  if (status === 401 || status === 403) return { code: "unauthorized", message: "ElevenLabs rejected the server credential or voice access." };
  if (status >= 500) return { code: "upstream_error", message: `ElevenLabs had a server error (HTTP ${status}). Try again shortly.` };
  return { code: "http_error", message: `ElevenLabs speech generation failed (HTTP ${status}).` };
}

/** Reads at most `max` bytes of a response body as text, then cancels the rest. */
export async function readErrorBody(response: Response, max = ERROR_BODY_MAX_BYTES): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = value.subarray(0, max - total);
      parts.push(take);
      total += take.byteLength;
    }
  } catch {
    /* a broken error body still has a status to report */
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Records a voice failure for Jarvis diagnostics. Only the status and code are
 * stored, never the text being spoken. Never throws.
 */
export async function reportVoiceFailure(error: ElevenLabsError, stream: boolean): Promise<void> {
  try {
    const { captureError } = await import("./monitoring.server");
    await captureError(
      { message: `Jarvis voice: ${error.code}` },
      { level: "warning", source: "server", route: "jarvis.voice", statusCode: error.status || null, context: { status: error.status, code: error.code, stream } },
    );
  } catch {
    /* monitoring must never break the voice path */
  }
}

/** Starts an ElevenLabs request and returns its checked audio response. Throws ElevenLabsError. */
export async function requestElevenLabsSpeech(text: string, options: { stream: boolean }): Promise<Response> {
  const { apiKey, voiceId } = voiceConfig();
  const path = options.stream ? "/stream" : "";
  // The streaming endpoint starts sending audio after the first words are
  // generated; latency level 3 trades a little quality for a faster start.
  const query = options.stream ? "output_format=mp3_22050_32&optimize_streaming_latency=3" : "output_format=mp3_22050_32";
  const fail = async (error: ElevenLabsError): Promise<never> => {
    await reportVoiceFailure(error, options.stream);
    throw error;
  };
  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}${path}?${query}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.18, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(18_000),
      // Cloudflare Workers reject redirect: "error"; "manual" plus the
      // response.ok check below still refuses any redirect.
      redirect: "manual",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("[jarvis-voice] ElevenLabs request failed", error instanceof Error ? error.name : "unknown");
    return fail(
      timedOut
        ? new ElevenLabsError(0, "timeout", "ElevenLabs took too long to respond. Try a shorter reply or try again.")
        : new ElevenLabsError(0, "unreachable", "ElevenLabs could not be reached from the server. Try again in a moment."),
    );
  }

  if (!response.ok) {
    const bodyText = await readErrorBody(response);
    const { code, message } = describeElevenLabsFailure(response.status, bodyText);
    return fail(new ElevenLabsError(response.status, code, message));
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("audio/")) {
    await response.body?.cancel().catch(() => undefined);
    return fail(new ElevenLabsError(response.status, "bad_response", "ElevenLabs returned an unexpected response instead of audio."));
  }
  if (!response.body) return fail(new ElevenLabsError(response.status, "bad_response", "ElevenLabs returned an empty audio response."));
  return response;
}

/** Passes audio through untouched, failing the stream past the size limit. */
export function cappedAudioStream(body: ReadableStream<Uint8Array>, max = VOICE_MAX_BYTES) {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > max) {
          controller.error(new Error("Generated voice response exceeded the safety size limit."));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/** Reads a whole (non-streamed) audio response, refusing past the size limit. */
export async function readAudio(response: Response, max = VOICE_MAX_BYTES): Promise<Uint8Array[]> {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Generated voice response exceeded the safety size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}
