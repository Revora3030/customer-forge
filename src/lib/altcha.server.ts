/**
 * ALTCHA proof-of-work captcha for public forms (MIT, https://altcha.org,
 * https://github.com/altcha-org/altcha-lib). Free, self-hosted, no third-party
 * call, no sign-up and no API key: challenges are signed with our own HMAC key
 * and verified with Web Crypto, so it runs in the Worker runtime.
 *
 * Key: `ALTCHA_HMAC_KEY` when set (a self-generated random string). Until that
 * Lovable secret exists, a key is derived one-way from the service-role key
 * with a fixed label, so the feature works without a new secret and the
 * service-role key itself is never exposed or reused as-is.
 *
 * Fail-open rules (a lost real lead costs more than a bot that slips through,
 * and the IP/contact rate limits still apply):
 *  - no key available, or verification throws  -> "unavailable" (accept)
 *  - no payload (widget blocked, slow, old JS)  -> "missing" (accept)
 *  - a payload that is forged, tampered, expired or the widget's test mode
 *    -> "invalid" (callers drop it silently, like the honeypot)
 */
import { createChallenge, randomInt, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/sha";

export const ALTCHA_ALGORITHM = "SHA-256";
/** ~0.3–1 s of background work on a phone; trivial for a person, costly at bot scale. */
export const ALTCHA_COUNTER_MIN = 20_000;
export const ALTCHA_COUNTER_MAX = 60_000;
export const ALTCHA_TTL_MS = 20 * 60_000;
const MAX_PAYLOAD_CHARS = 4_000;

export type AltchaVerdict = "verified" | "missing" | "invalid" | "unavailable";

let derivedKey: Promise<string | null> | null = null;

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signing key, or null when the server has no secret to build one from. */
export async function altchaHmacKey(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  const own = env["ALTCHA_HMAC_KEY"]?.trim();
  if (own && own.length >= 16) return own;
  const base = env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!base) return null;
  if (env === process.env) {
    derivedKey ??= hmacHex(base, "revora-altcha-hmac-v1");
    return derivedKey;
  }
  return hmacHex(base, "revora-altcha-hmac-v1");
}

/** A fresh signed challenge for the widget, or null when no key is available. */
export async function createAltchaChallenge(key?: string | null) {
  const secret = key === undefined ? await altchaHmacKey() : key;
  if (!secret) return null;
  return createChallenge({
    algorithm: ALTCHA_ALGORITHM,
    cost: 1,
    counter: randomInt(ALTCHA_COUNTER_MIN, ALTCHA_COUNTER_MAX),
    deriveKey,
    hmacSignatureSecret: secret,
    expiresAt: new Date(Date.now() + ALTCHA_TTL_MS),
  });
}

/** Checks the base64 payload the widget puts in the form's `altcha` field. */
export async function verifyAltchaPayload(payload: unknown, key?: string | null): Promise<AltchaVerdict> {
  const raw = typeof payload === "string" ? payload.trim() : "";
  if (!raw) return "missing";
  if (raw.length > MAX_PAYLOAD_CHARS) return "invalid";
  let secret: string | null;
  try {
    secret = key === undefined ? await altchaHmacKey() : key;
  } catch {
    return "unavailable";
  }
  if (!secret) return "unavailable";
  let decoded: { challenge?: unknown; solution?: unknown } | null;
  try {
    decoded = JSON.parse(atob(raw)) as { challenge?: unknown; solution?: unknown };
  } catch {
    return "invalid";
  }
  if (!decoded || typeof decoded !== "object" || !decoded.challenge || !decoded.solution) return "invalid";
  try {
    const result = await verifySolution({
      challenge: decoded.challenge as never,
      solution: decoded.solution as never,
      deriveKey,
      hmacSignatureSecret: secret,
    });
    return result.verified ? "verified" : "invalid";
  } catch (error) {
    // A malformed challenge object is a forgery, not an outage.
    if (error instanceof TypeError || error instanceof RangeError) return "invalid";
    console.error("altcha verification failed", error instanceof Error ? error.message : error);
    return "unavailable";
  }
}
