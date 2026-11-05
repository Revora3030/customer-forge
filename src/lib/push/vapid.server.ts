/**
 * Web Push (VAPID) configuration for owner speed-to-lead alerts.
 *
 * Env vars (server-only; never commit real values):
 *   VAPID_PUBLIC_KEY  — base64url uncompressed P-256 public key (the browser's
 *                       applicationServerKey). Public by design.
 *   VAPID_PRIVATE_KEY — the matching base64url P-256 private key (the 32-byte "d").
 *   VAPID_SUBJECT     — "mailto:ops@your-domain" or an https: URL.
 * Standard web-push key format: generate a pair with `npx web-push generate-vapid-keys`
 * (MIT; run it locally, don't add it as a dependency).
 */
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function readVapidConfig(
  env: Record<string, string | undefined> = process.env,
): VapidConfig | null {
  const publicKey = (env["VAPID_PUBLIC_KEY"] ?? "").trim();
  const privateKey = (env["VAPID_PRIVATE_KEY"] ?? "").trim();
  const subject = (env["VAPID_SUBJECT"] ?? "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!BASE64URL.test(publicKey) || publicKey.length < 80) return null;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/i.test(subject)) return null;
  // 65-byte uncompressed point = 87 base64url chars; 32-byte scalar = 43 chars.
  if (publicKey.length !== 87 || !BASE64URL.test(privateKey) || privateKey.length !== 43)
    return null;
  return { publicKey, privateKey, subject };
}
