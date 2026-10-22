/**
 * Lovable AI speech (text-to-speech) for Jarvis. Server-only.
 *
 * Contract (Lovable AI gateway, Gemini TTS family): POST /v1/audio/speech with
 * the native `contents` + `generationConfig` body. `stream_format: "audio"`
 * returns one complete WAV file, which plays in an ordinary <audio> element.
 *
 * Every call reserves against the shared monthly + daily paid caps first
 * (reserveBudget), settles afterwards and writes a usage row. The spend is a
 * conservative per-character ESTIMATE (env-overridable) because the gateway
 * does not return a price; it is labelled as an estimate wherever shown.
 */

import { MICROCENTS_PER_DOLLAR, recordUsage, reserveBudget, settleBudget } from "@/lib/ai/luna.server";

export const LOVABLE_SPEECH_DEFAULT_MODEL = "google/gemini-3.1-flash-tts-preview";
/** Active zero-retention TTS ids seen in the live catalogue (2026-10-22). */
export const LOVABLE_SPEECH_MODELS = [
  "google/gemini-3.1-flash-tts-preview",
  "google/gemini-2.5-flash-tts",
  "google/gemini-2.5-pro-tts",
] as const;
export const LOVABLE_SPEECH_VOICE = "Kore";
export const LOVABLE_SPEECH_MAX_BYTES = 6_000_000; // ~2 min of 24 kHz 16-bit mono WAV
export const LOVABLE_SPEECH_MAX_CHARS = 1_500;
/** Conservative estimate; not a quoted price. Override with LOVABLE_TTS_USD_PER_1K_CHARS. */
export const DEFAULT_TTS_USD_PER_1K_CHARS = 0.02;

const GATEWAY = "https://ai.gateway.lovable.dev/v1/audio/speech";

export type LovableSpeechResult =
  | { ok: true; audio: Uint8Array; contentType: "audio/wav"; model: string; estimatedMicrocents: number }
  | {
      ok: false;
      code: "not_configured" | "too_long" | "ledger_unavailable" | "budget_exhausted" | "provider_error" | "bad_response" | "too_large" | "aborted";
      status?: number;
      message: string;
    };

export function speechModel(): string {
  const requested = process.env["AI_LOVABLE_MODEL_SPEECH"]?.trim();
  return requested && (LOVABLE_SPEECH_MODELS as readonly string[]).includes(requested) ? requested : LOVABLE_SPEECH_DEFAULT_MODEL;
}

export function speechEstimateMicrocents(chars: number): number {
  const raw = Number(process.env["LOVABLE_TTS_USD_PER_1K_CHARS"]);
  const perK = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTS_USD_PER_1K_CHARS;
  return Math.max(1, Math.ceil((Math.max(chars, 100) / 1000) * perK * MICROCENTS_PER_DOLLAR));
}

export function lovableSpeechBody(model: string, text: string) {
  return {
    model,
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LOVABLE_SPEECH_VOICE } } },
    },
    stream_format: "audio",
  };
}

export function lovableSpeechConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]?.trim());
}

async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/** True when the bytes start with a RIFF/WAVE header. */
export function isWav(bytes: Uint8Array): boolean {
  return bytes.byteLength > 44 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE";
}

export async function synthesizeLovableSpeech(
  text: string,
  caller: { organizationId: string | null; signal?: AbortSignal },
): Promise<LovableSpeechResult> {
  const apiKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!apiKey) return { ok: false, code: "not_configured", message: "Lovable AI speech is not connected on the server." };
  if (text.length > LOVABLE_SPEECH_MAX_CHARS) return { ok: false, code: "too_long", message: "That reply is too long to speak in one go." };

  const model = speechModel();
  const estimate = speechEstimateMicrocents(text.length);
  const reservation = await reserveBudget(estimate, caller.organizationId);
  if (!reservation) return { ok: false, code: "ledger_unavailable", message: "Revora could not confirm the AI spending cap, so no voice was made." };
  if (!reservation.allowed) {
    await recordUsage({ organizationId: caller.organizationId, purpose: "speech_generation", model, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, cost: 0, outcome: "skipped", reason: "budget_exhausted" });
    return { ok: false, code: "budget_exhausted", message: "The AI spending allowance is used up, so no voice was made." };
  }

  let actual = 0;
  try {
    let response: Response;
    try {
      response = await fetch(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(lovableSpeechBody(model, text)),
        redirect: "manual",
        ...(caller.signal ? { signal: caller.signal } : {}),
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { ok: false, code: aborted ? "aborted" : "provider_error", message: aborted ? "Voice was stopped." : "Lovable AI speech could not be reached." };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const message =
        response.status === 402 ? "Lovable AI credits are used up, so no voice was made." :
        response.status === 429 ? "Lovable AI speech is busy. Try again shortly." :
        `Lovable AI speech failed (HTTP ${response.status}).`;
      return { ok: false, code: "provider_error", status: response.status, message };
    }
    if (!response.body) return { ok: false, code: "bad_response", message: "Lovable AI speech returned no audio." };
    // Any response that reached the provider is billed at the estimate.
    actual = estimate;
    const audio = await readCapped(response, LOVABLE_SPEECH_MAX_BYTES);
    if (!audio) return { ok: false, code: "too_large", message: "The generated voice was larger than the safety limit." };
    if (!isWav(audio)) return { ok: false, code: "bad_response", message: "Lovable AI speech returned something other than audio." };
    return { ok: true, audio, contentType: "audio/wav", model, estimatedMicrocents: estimate };
  } finally {
    await settleBudget(caller.organizationId, estimate, actual, reservation.paid);
    await recordUsage({
      organizationId: caller.organizationId,
      purpose: "speech_generation",
      model,
      usage: { inputTokens: text.length, cachedInputTokens: 0, outputTokens: 0 },
      cost: actual,
      outcome: actual > 0 ? "succeeded" : "failed",
      reason: actual > 0 ? "estimated_cost" : null,
    }).catch(() => undefined);
  }
}
