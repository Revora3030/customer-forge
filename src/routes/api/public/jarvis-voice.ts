import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams one sentence of Jarvis's ElevenLabs voice to an <audio> element.
 * Access is a signed two-minute link minted by a super-admin's server call
 * (jarvisVoiceLinks); the link can only speak the text it was signed for.
 */
async function handle(request: Request): Promise<Response> {
  const fail = (status: number, error: string) =>
    Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

  const { voiceConfig, requestElevenLabsSpeech, cappedAudioStream } = await import("@/lib/jarvis-voice.server");
  const { verifyVoiceLink } = await import("@/lib/jarvis-voice-token.server");

  let apiKey: string;
  try {
    apiKey = voiceConfig().apiKey;
  } catch (error) {
    return fail(503, error instanceof Error ? error.message : "Voice is not configured.");
  }

  const url = new URL(request.url);
  const text = await verifyVoiceLink(apiKey, url.searchParams.get("p"), url.searchParams.get("s"));
  if (!text) return fail(403, "This voice link is invalid or has expired.");

  try {
    const upstream = await requestElevenLabsSpeech(text, { stream: true });
    return new Response(cappedAudioStream(upstream.body!), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : "ElevenLabs was unavailable.");
  }
}

export const Route = createFileRoute("/api/public/jarvis-voice")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
    },
  },
});
