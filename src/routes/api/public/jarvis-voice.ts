import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams one sentence of Jarvis's ElevenLabs voice to an <audio> element.
 * Access is a signed two-minute link minted on the server: by a super-admin's
 * call (jarvisVoiceLinks), or for the visitor Jarvis's own reply. A link can
 * only speak the text it was signed for, may be fetched only a few times
 * (its nonce is claimed first), and spends its scope's daily character cap
 * before ElevenLabs is called.
 */
async function handle(request: Request): Promise<Response> {
  const fail = (status: number, error: string, code?: string) =>
    Response.json(code ? { error, code } : { error }, { status, headers: { "cache-control": "no-store" } });

  const { voiceConfig, requestElevenLabsSpeech, cappedAudioStream, ElevenLabsError } = await import("@/lib/jarvis-voice.server");
  const { verifyVoiceLink } = await import("@/lib/jarvis-voice-token.server");
  const { claimVoiceLink, reserveVoiceChars, VOICE_LINK_MAX_USES } = await import("@/lib/jarvis-voice-budget.server");

  let apiKey: string;
  try {
    apiKey = voiceConfig().apiKey;
  } catch (error) {
    return fail(503, error instanceof Error ? error.message : "Voice is not configured.");
  }

  const url = new URL(request.url);
  const link = await verifyVoiceLink(apiKey, url.searchParams.get("p"), url.searchParams.get("s"));
  if (!link) return fail(403, "This voice link is invalid or has expired.");

  const claim = await claimVoiceLink(link.nonce, VOICE_LINK_MAX_USES, new Date(link.expiresAt));
  if (!claim.allowed) return fail(429, "This voice link has already been used.", "link_used");
  const budget = await reserveVoiceChars(link.scope, link.text.length);
  if (!budget.allowed) return fail(429, "Today's ElevenLabs voice budget is used up.", "budget_exhausted");

  try {
    const upstream = await requestElevenLabsSpeech(link.text, { stream: true });
    return new Response(cappedAudioStream(upstream.body!), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        // Each fetch is a fresh, metered generation; byte ranges can't be served.
        "accept-ranges": "none",
      },
    });
  } catch (error) {
    if (error instanceof ElevenLabsError) return fail(502, error.message, error.code);
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
