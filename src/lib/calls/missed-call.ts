/**
 * Missed-call alerts over Twilio Voice (Lovable round 10, item 4). Pure,
 * browser-safe helpers: TwiML, status mapping and phone handling. The webhook
 * routes and database work live in `missed-call.server.ts`.
 *
 * Flow: a business's Twilio number points its Voice webhook at
 * `/api/public/twilio/voice?org=<organization id>`. Jarvis answers with a
 * <Dial> to the owner's business phone; when that leg ends, Twilio posts the
 * result to `/api/public/twilio/call-status?org=…`. A no-answer, busy, failed
 * or canceled dial becomes a `missed_call` lead plus an instant owner email
 * with a one-tap `tel:` callback link. Voice only: nothing here sends SMS.
 */

export const VOICE_PATH = "/api/public/twilio/voice";
export const CALL_STATUS_PATH = "/api/public/twilio/call-status";
/** Seconds the owner's phone rings before the call counts as missed. */
export const DIAL_TIMEOUT_SECONDS = 20;
/** Lead source for a call nobody picked up. */
export const MISSED_CALL_SOURCE = "missed_call";

/** DialCallStatus values that mean nobody spoke with the caller. */
const MISSED_STATUSES = new Set(["no-answer", "busy", "failed", "canceled"]);

export function isMissedDialStatus(status: string | null | undefined): boolean {
  return MISSED_STATUSES.has((status ?? "").trim().toLowerCase());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The organization named in the webhook URL, or null when it is not a UUID. */
export function orgIdFromUrl(url: string): string | null {
  try {
    const value = new URL(url).searchParams.get("org")?.trim() ?? "";
    return UUID.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * A dialable E.164 number, or null. Ten-digit numbers are treated as US/Canada.
 * Twilio sends values like "Anonymous", "Restricted" or "+266696687" for
 * blocked caller ID; those cannot be called back.
 */
export function toE164(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || /anonymous|restricted|unknown|private/i.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+")) {
    if (digits === "266696687" || digits === "86282452253") return null; // Twilio's anonymous placeholders
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "(919) 555-0134" for +1 numbers; the E.164 string otherwise. */
export function displayPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

export const TWIML_HEADERS = { "Content-Type": "text/xml; charset=utf-8" } as const;

/** Rings the owner; Twilio posts the dial result to `actionUrl`. The caller's own number is shown. */
export function dialTwiml(forwardTo: string, actionUrl: string, timeout = DIAL_TIMEOUT_SECONDS): string {
  return twiml(
    `<Dial action="${escapeXml(actionUrl)}" method="POST" timeout="${timeout}" answerOnBridge="true">` +
      `<Number>${escapeXml(forwardTo)}</Number></Dial>`,
  );
}

/** What a caller hears when nobody picked up. Makes no promise the business has their number. */
export function missedCallTwiml(businessName?: string | null): string {
  const name = businessName?.trim() ? ` ${businessName.trim().slice(0, 80)}` : "";
  return twiml(`<Say>Sorry we missed your call to${escapeXml(name || " us")}. We will get back to you as soon as we can.</Say><Hangup/>`);
}

/** Ends the call quietly, e.g. after the owner answered and hung up. */
export function hangupTwiml(): string {
  return twiml("<Hangup/>");
}

/** The action URL for the dial, keeping the organization in the signed query string. */
export function callStatusUrl(orgId: string): string {
  return `${CALL_STATUS_PATH}?org=${encodeURIComponent(orgId)}`;
}

/** Marker stored in the lead's notes, so a repeated callback never creates a second lead. */
export function callSidMarker(callSid: string): string {
  return `twilio_call_sid:${callSid}`;
}

const CALL_SID = /^CA[0-9a-f]{32}$/i;
export function isCallSid(value: string | null | undefined): value is string {
  return CALL_SID.test(value ?? "");
}
