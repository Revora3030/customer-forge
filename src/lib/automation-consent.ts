/**
 * Consent gate for workspace automation messages, applied inside the one
 * existing delivery path (messaging.server.ts deliverEmail / deliverSms) right
 * before a provider is called. It never sends anything itself.
 *
 * - STOP / unsubscribe: a recipient on the platform do-not-contact list (STOP
 *   replies land there through the Twilio inbound webhook) is never messaged.
 * - SMS opt-in: review requests by text need a recorded SMS opt-in (START/YES
 *   reply). Other automation texts answer an enquiry the person just made.
 * - Quiet hours: texts go out only 9:00–20:00 in every zone the number may be
 *   in (fail closed to all continental US zones); outside that window the run
 *   stays queued and retries when the window opens.
 *
 * Lookups are injected so the rules are testable without a database; a lookup
 * that fails is treated as "blocked" by the caller.
 */

/** Trigger events whose messages ask for a review. */
export const REVIEW_TRIGGERS = new Set(["review_request", "appointment_completed"]);

export type ConsentLookups = {
  isDoNotContact: (value: string) => Promise<boolean>;
  hasSmsConsent: (phone: string) => Promise<boolean>;
  smsAllowedAt: (when: Date, phone: string) => boolean;
};

export type GateResult =
  | { ok: true }
  | { ok: false; retry: false; reason: "recipient_suppressed" | "sms_no_opt_in" }
  | { ok: false; retry: true; reason: "sms_quiet_hours"; retryAfterSeconds: number };

const QUARTER_HOUR_MS = 15 * 60_000;

/** Seconds until texts may go out again (searched in quarter hours, max 2 days). */
export function secondsUntilSmsWindow(now: Date, phone: string, allowed: ConsentLookups["smsAllowedAt"]): number {
  let at = Math.ceil((now.getTime() + 1) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  for (let step = 0; step < 4 * 48; step += 1, at += QUARTER_HOUR_MS) {
    if (allowed(new Date(at), phone)) return Math.max(60, Math.round((at - now.getTime()) / 1000));
  }
  return 86_400;
}

export async function automationContactGate(
  run: { action_type: string; recipient: string; trigger_event?: string | null },
  lookups: ConsentLookups,
  now: Date = new Date(),
): Promise<GateResult> {
  if (await lookups.isDoNotContact(run.recipient)) {
    return { ok: false, retry: false, reason: "recipient_suppressed" };
  }
  if (run.action_type !== "sms") return { ok: true };
  if (REVIEW_TRIGGERS.has(run.trigger_event ?? "") && !(await lookups.hasSmsConsent(run.recipient))) {
    return { ok: false, retry: false, reason: "sms_no_opt_in" };
  }
  if (!lookups.smsAllowedAt(now, run.recipient)) {
    return {
      ok: false,
      retry: true,
      reason: "sms_quiet_hours",
      retryAfterSeconds: secondsUntilSmsWindow(now, run.recipient, lookups.smsAllowedAt),
    };
  }
  return { ok: true };
}
