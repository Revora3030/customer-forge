/**
 * The one place that calls ElevenLabs. Used by the buffered server function and
 * by the streaming route, so both share the voice, model and error messages.
 */

export const VOICE_MAX_BYTES = 1_500_000;

export function voiceConfig() {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) throw new Error("ElevenLabs is not configured on the server. Add ELEVENLABS_API_KEY to the server runtime secrets.");
  const voiceId = process.env["ELEVENLABS_VOICE_ID"] || "JBFqnCBsd6RMkjVDRZzb";
  if (!/^[a-zA-Z0-9_-]{5,100}$/.test(voiceId)) throw new Error("The configured ElevenLabs voice ID is invalid.");
  return { apiKey, voiceId };
}

/** Starts an ElevenLabs request and returns its checked audio response. */
export async function requestElevenLabsSpeech(text: string, options: { stream: boolean }): Promise<Response> {
  const { apiKey, voiceId } = voiceConfig();
  const path = options.stream ? "/stream" : "";
  // The streaming endpoint starts sending audio after the first words are
  // generated; latency level 3 trades a little quality for a faster start.
  const query = options.stream ? "output_format=mp3_22050_32&optimize_streaming_latency=3" : "output_format=mp3_22050_32";
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
    console.error("[jarvis-voice] ElevenLabs request failed", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
    throw new Error(
      timedOut
        ? "ElevenLabs took too long to respond. Try a shorter reply or try again."
        : "ElevenLabs could not be reached from the server. Try again in a moment.",
    );
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401 || response.status === 403) throw new Error("ElevenLabs rejected the server credential or voice access.");
    if (response.status === 429) throw new Error("ElevenLabs rate or credit limit reached. Check your ElevenLabs plan.");
    throw new Error(`ElevenLabs speech generation failed (HTTP ${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("audio/")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("ElevenLabs returned an unexpected response instead of audio.");
  }
  if (!response.body) throw new Error("ElevenLabs returned an empty audio response.");
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
