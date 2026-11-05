/**
 * Password protection for shared preview links (LOV-6): pure helpers.
 *
 * Passwords are hashed with salted PBKDF2-SHA256 through Web Crypto (no
 * dependency, same on the server and in tests). 100,000 iterations is the most
 * the edge runtime's PBKDF2 allows. The stored string is self-describing so the
 * cost can be raised later without breaking old links:
 *   pbkdf2$<iterations>$<salt base64url>$<hash base64url>
 */

export const PREVIEW_PASSWORD_MIN = 8;
export const PREVIEW_PASSWORD_MAX = 128;
const ITERATIONS = 100_000;
const MAX_ACCEPTED_ITERATIONS = 100_000;

export const PREVIEW_PASSWORD_TOO_SHORT = `Use a password of at least ${PREVIEW_PASSWORD_MIN} characters.`;
export const PREVIEW_PASSWORD_TOO_LONG = `Use a password of at most ${PREVIEW_PASSWORD_MAX} characters.`;

/** Null when no password was asked for; throws a plain-words error for a bad one. */
export function parseNewPreviewPassword(input: unknown): string | null {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string") throw new Error(PREVIEW_PASSWORD_TOO_SHORT);
  if (input.length < PREVIEW_PASSWORD_MIN) throw new Error(PREVIEW_PASSWORD_TOO_SHORT);
  if (input.length > PREVIEW_PASSWORD_MAX) throw new Error(PREVIEW_PASSWORD_TOO_LONG);
  return input;
}

function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const text = atob(padded);
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison of two byte strings of any length. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPreviewPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** False for a wrong password and for any stored value this code does not understand. */
export async function verifyPreviewPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, hashText] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterationsText || !saltText || !hashText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ACCEPTED_ITERATIONS) return false;
  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(hashText);
  if (!salt || !expected || password.length > PREVIEW_PASSWORD_MAX) return false;
  return timingSafeEqual(await derive(password, salt, iterations), expected);
}

/** A throwaway verification so an unknown link costs the same time as a real one. */
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export async function spendVerifyTime(password: string): Promise<void> {
  await verifyPreviewPassword(password, DUMMY_HASH);
}

/** Cookie that remembers a correct password for one link in one browser. */
export function unlockCookieName(token: string): string {
  return `rvpv_${token.slice(0, 40)}`;
}

/** Proof stored in that cookie: an HMAC that stops matching if the password is changed or removed. */
export async function unlockProof(secret: string, linkId: string, passwordHash: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`preview-unlock|${linkId}|${passwordHash}`));
  return toBase64Url(new Uint8Array(signature));
}

export async function unlockProofMatches(
  secret: string | null,
  linkId: string,
  passwordHash: string,
  presented: string | undefined,
): Promise<boolean> {
  if (!secret || !presented) return false;
  const expected = await unlockProof(secret, linkId, passwordHash);
  return timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(presented));
}
