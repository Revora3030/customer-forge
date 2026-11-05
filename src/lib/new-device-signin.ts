/**
 * LOV-13 — new-device / new-country sign-in email helpers.
 *
 * Ships OFF until `REVORA_NEW_DEVICE_EMAIL=1`. Stores only a SHA-256 device
 * hash and a country code; never IP, user-agent, or the raw device id.
 */

export const NEW_DEVICE_EMAIL_ENV = "REVORA_NEW_DEVICE_EMAIL";
export const DEVICE_STORAGE_KEY = "revora:sign-in-device-id";
export const ALERT_COOLDOWN_MS = 86_400_000;

/** Feature flag. Default OFF — never email until Manager sets the env. */
export function isNewDeviceEmailEnabled(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): boolean {
  return env[NEW_DEVICE_EMAIL_ENV] === "1";
}

/** Cloudflare `cf-ipcountry` → 2-letter upper, or "unknown". */
export function normalizeCountry(raw: string | null | undefined): string {
  const c = (raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1") return c;
  return "unknown";
}

export type AlertDecision =
  | { send: false; reason: "disabled" | "first_device" | "known_device" | "cooldown" }
  | { send: true; reason: "new_device" | "new_country" };

/**
 * Decide whether to email. First-ever device for the account never alerts
 * (covers brand-new sign-ups). Known hash+country is quiet. Otherwise alert
 * unless we already emailed this account in the last 24 hours.
 */
export function shouldSendNewDeviceAlert(input: {
  enabled: boolean;
  deviceCountBefore: number;
  knownDevice: boolean;
  countryChanged: boolean;
  lastAlertAt: Date | string | null;
  now?: Date;
}): AlertDecision {
  if (!input.enabled) return { send: false, reason: "disabled" };
  if (input.deviceCountBefore === 0) return { send: false, reason: "first_device" };
  if (input.knownDevice && !input.countryChanged) return { send: false, reason: "known_device" };
  const last = input.lastAlertAt ? new Date(input.lastAlertAt).getTime() : 0;
  const now = (input.now ?? new Date()).getTime();
  if (last > 0 && now - last < ALERT_COOLDOWN_MS) return { send: false, reason: "cooldown" };
  return { send: true, reason: input.knownDevice ? "new_country" : "new_device" };
}

/** Stable local device id (UUID). Creates one on first use. */
export function getOrCreateDeviceId(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): string {
  try {
    const existing = storage.getItem(DEVICE_STORAGE_KEY)?.trim();
    if (existing && existing.length >= 8 && existing.length <= 80) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    storage.setItem(DEVICE_STORAGE_KEY, id);
    return id;
  } catch {
    return `ephemeral-${Date.now().toString(36)}`;
  }
}

export async function hashDeviceId(userId: string, deviceId: string): Promise<string> {
  const payload = `sign-in-device|${userId}|${deviceId}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(payload).digest("hex");
}

export function newDeviceEmailCopy(country: string): {
  heading: string;
  message: string;
  businessName: string;
} {
  const where = country === "unknown" ? "an unrecognized location" : country;
  return {
    businessName: "Revora Growth Systems",
    heading: "New sign-in to your Revora account",
    message: [
      `We noticed a sign-in from a device or place we have not seen on your account before (${where}).`,
      "",
      "If this was you, you can ignore this email. If it was not, sign in and change your password, and turn on an authenticator app code under Settings when available.",
      "",
      "This alert only names the country when Cloudflare provides one. It never stores a browser fingerprint beyond a one-way hash.",
    ].join("\n"),
  };
}
