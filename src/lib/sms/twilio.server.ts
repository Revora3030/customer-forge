/**
 * Twilio text messages. Server-only: reads TWILIO_* secrets, never returns them.
 *
 * Sends through the Messages REST endpoint with basic auth, from either
 * TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER. A send is reported only
 * when Twilio accepts it and returns a message SID. Inbound webhooks are
 * verified with the X-Twilio-Signature HMAC before anything is trusted.
 */

export const TWILIO_SECRETS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] as const;

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  from: string | null;
  messagingServiceSid: string | null;
};

export type TwilioSendResult =
  | { ok: true; sid: string }
  | { ok: false; retry: boolean; reason: string };

const env = (name: string) => process.env[name]?.trim() || null;

/** The Twilio account to send from, or null when it isn't fully configured. */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID");
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) return null;
  return { accountSid, authToken, from, messagingServiceSid };
}

/** Names (never values) of the secrets still missing. */
export function missingTwilioSecrets(): string[] {
  const missing: string[] = [];
  if (!env("TWILIO_ACCOUNT_SID")) missing.push("TWILIO_ACCOUNT_SID");
  if (!env("TWILIO_AUTH_TOKEN")) missing.push("TWILIO_AUTH_TOKEN");
  if (!env("TWILIO_FROM_NUMBER") && !env("TWILIO_MESSAGING_SERVICE_SID")) missing.push("TWILIO_FROM_NUMBER");
  return missing;
}

// Twilio error codes that mean "this number can't be texted", not a blip.
const PERMANENT_CODES: Record<number, string> = {
  21211: "invalid_phone_number",
  21614: "not_a_mobile_number",
  21610: "recipient_opted_out",
  21408: "sms_region_not_enabled",
  21612: "sms_route_unavailable",
};

export async function sendTwilioSms(
  to: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TwilioSendResult> {
  const config = twilioConfig();
  if (!config) return { ok: false, retry: false, reason: "sms_not_configured" };
  const form = new URLSearchParams({ To: to, Body: body });
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
  else if (config.from) form.set("From", config.from);

  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return { ok: false, retry: true, reason: "sms_transport_error" };
  }
  const payload = (await response.json().catch(() => null)) as { sid?: unknown; code?: unknown } | null;
  if (response.ok && typeof payload?.sid === "string") return { ok: true, sid: payload.sid };
  const code = typeof payload?.code === "number" ? payload.code : null;
  if (code !== null && PERMANENT_CODES[code]) return { ok: false, retry: false, reason: PERMANENT_CODES[code] };
  if (response.status === 401 || response.status === 403) return { ok: false, retry: false, reason: "sms_auth_failed" };
  if (response.status === 429) return { ok: false, retry: true, reason: "rate_limited" };
  return { ok: false, retry: response.status >= 500, reason: code ? `twilio_error_${code}` : `twilio_http_${response.status}` };
}

/**
 * Twilio's webhook signature: base64(HMAC-SHA1(authToken, url + each POST
 * param name and value, sorted by name)). Compared in constant time.
 */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]); // DevSkim: ignore DS126858 -- Twilio signs webhooks with HMAC-SHA1 (X-Twilio-Signature); verifying that MAC requires SHA-1, and HMAC-SHA1 is not broken for authentication.
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (!authToken || !signature) return false;
  const expected = await twilioSignature(authToken, url, params);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
