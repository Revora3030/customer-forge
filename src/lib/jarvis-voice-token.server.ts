/**
 * Short-lived signed links for Jarvis's streamed voice.
 *
 * An <audio> element can't send an Authorization header, so a super-admin's
 * server call mints one link per sentence. The link carries the text and an
 * expiry, signed with a key derived from the server's ElevenLabs secret: it
 * can only speak the exact text Jarvis was asked to say, and only for two
 * minutes. The key itself never leaves the server.
 */

export const VOICE_LINK_TTL_MS = 120_000;
export const VOICE_STREAM_PATH = "/api/public/jarvis-voice";

const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function mac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(`jarvis-voice-link:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

/** Constant-time string comparison. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signVoiceLink(secret: string, text: string, now = Date.now()): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify({ t: text, e: now + VOICE_LINK_TTL_MS })));
  return `${VOICE_STREAM_PATH}?p=${payload}&s=${await mac(secret, payload)}`;
}

/** The text a link may speak, or null when it is forged, altered or expired. */
export async function verifyVoiceLink(secret: string, payload: string | null, signature: string | null, now = Date.now()): Promise<string | null> {
  if (!payload || !signature || payload.length > 4_000) return null;
  if (!same(await mac(secret, payload), signature)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { t?: unknown; e?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.e !== "number" || parsed.e < now) return null;
    return parsed.t;
  } catch {
    return null;
  }
}
