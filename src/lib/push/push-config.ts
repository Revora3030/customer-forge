/** Client-safe Web Push helpers (no env access). VAPID env parsing lives in vapid.server.ts. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Browser-side: base64url VAPID public key → Uint8Array applicationServerKey. */
export function applicationServerKey(publicKey: string): Uint8Array {
  const padded = publicKey
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(publicKey.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The validated shape of `PushSubscription.toJSON()` we store. */
export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };

export function parseSubscription(input: unknown): StoredSubscription | null {
  if (!input || typeof input !== "object") return null;
  const value = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
  const p256dh = typeof value.keys?.p256dh === "string" ? value.keys.p256dh.trim() : "";
  const auth = typeof value.keys?.auth === "string" ? value.keys.auth.trim() : "";
  if (!/^https:\/\/[^\s]+$/.test(endpoint) || endpoint.length > 2048) return null;
  try {
    const host = new URL(endpoint).hostname;
    if (
      host === "localhost" || // DevSkim: ignore DS162092 -- rejecting localhost endpoints, not debug code
      /^[\d.]+$/.test(host) ||
      host.startsWith("[") ||
      host.endsWith(".local")
    )
      return null;
  } catch {
    return null;
  }
  if (!BASE64URL.test(p256dh.replace(/=+$/, "")) || p256dh.length < 40 || p256dh.length > 200)
    return null;
  if (!BASE64URL.test(auth.replace(/=+$/, "")) || auth.length < 8 || auth.length > 64) return null;
  return { endpoint, p256dh, auth };
}

/** Notification payload for a new lead. No visitor contact details leave our servers. */
export function leadPushPayload(input: {
  leadId: string;
  businessName: string;
  kind: string;
  service?: string | null;
}) {
  const what = input.service ? `${input.kind} · ${input.service}` : input.kind;
  return {
    title: `${what} — reply fast`,
    body: `A new lead just came in for ${input.businessName}. Open it to respond in under 5 minutes.`,
    url: `/app/leads?lead=${encodeURIComponent(input.leadId)}`,
    tag: `lead-${input.leadId}`,
  };
}
