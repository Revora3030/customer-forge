/**
 * Consent gate for workspace automation messages, applied inside the one
 * existing delivery path (messaging.server.ts deliverEmail / deliverSms) right
 * before a provider is called. It never sends anything itself.
 *
 * - Stale reminders: a booking confirmation or reminder whose appointment has
 *   already started is dropped (`appointment_already_started`), never sent late.
 * - STOP / unsubscribe: a recipient on the platform do-not-contact list (STOP
 *   replies land there through the Twilio inbound webhook) is never messaged.
 * - SMS region: only North American (+1) numbers are texted, because quiet
 *   hours can only be worked out for them; any other number fails closed.
 * - SMS opt-in: review requests by text need a recorded SMS opt-in (START/YES
 *   reply). Other automation texts answer an enquiry the person just made.
 * - Quiet hours: texts go out only 9:00–20:00 in every zone the number may be
 *   in (its area code plus the business's state; fail closed to all continental
 *   US zones); outside that window the run stays queued and retries.
 *
 * Lookups are injected so the rules are testable without a database. A lookup
 * that THROWS (database unavailable) is not an answer: the message stays
 * blocked and the run stays queued (`consent_lookup_unavailable`, retryable),
 * so a transient outage never records a false "unsubscribed" or "no opt-in".
 */

/** Trigger events whose messages ask for a review. */
export const REVIEW_TRIGGERS = new Set(["review_request", "appointment_completed"]);

/** Trigger events whose messages are about an upcoming appointment. */
export const APPOINTMENT_REMINDER_TRIGGERS = new Set(["booking_created", "appointment_upcoming"]);

export type ConsentLookups = {
  /** Resolves true/false; throws when the list could not be read. */
  isDoNotContact: (value: string) => Promise<boolean>;
  /** Resolves true/false; throws when the list could not be read. */
  hasSmsConsent: (phone: string) => Promise<boolean>;
  smsAllowedAt: (when: Date, phone: string) => boolean;
};

export type GateRun = {
  action_type: string;
  recipient: string;
  trigger_event?: string | null;
  /** Start of the linked appointment, when the run belongs to one. */
  appointment_starts_at?: string | null;
};

export type GateResult =
  | { ok: true }
  | {
      ok: false;
      retry: false;
      reason: "recipient_suppressed" | "sms_no_opt_in" | "appointment_already_started" | "sms_region_unsupported";
    }
  | {
      ok: false;
      retry: true;
      reason: "sms_quiet_hours" | "consent_lookup_unavailable";
      retryAfterSeconds: number;
    };

const QUARTER_HOUR_MS = 15 * 60_000;
/** How long a run waits after a consent list could not be read. */
export const CONSENT_LOOKUP_RETRY_SECONDS = 300;

/** Only +1 (US/Canada) numbers have a knowable local time here. */
export const isNorthAmericanNumber = (phone: string) => /^\+1\d{10}$/.test(phone.replace(/[\s().-]/g, ""));

/** Seconds until texts may go out again (searched in quarter hours, max 2 days). */
export function secondsUntilSmsWindow(now: Date, phone: string, allowed: ConsentLookups["smsAllowedAt"]): number {
  let at = Math.ceil((now.getTime() + 1) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  for (let step = 0; step < 4 * 48; step += 1, at += QUARTER_HOUR_MS) {
    if (allowed(new Date(at), phone)) return Math.max(60, Math.round((at - now.getTime()) / 1000));
  }
  return 86_400;
}

const lookupUnavailable = (): GateResult => ({
  ok: false,
  retry: true,
  reason: "consent_lookup_unavailable",
  retryAfterSeconds: CONSENT_LOOKUP_RETRY_SECONDS,
});

export async function automationContactGate(
  run: GateRun,
  lookups: ConsentLookups,
  now: Date = new Date(),
): Promise<GateResult> {
  if (APPOINTMENT_REMINDER_TRIGGERS.has(run.trigger_event ?? "") && run.appointment_starts_at) {
    const starts = new Date(run.appointment_starts_at).getTime();
    if (Number.isFinite(starts) && starts <= now.getTime()) {
      return { ok: false, retry: false, reason: "appointment_already_started" };
    }
  }

  let suppressed: boolean;
  try {
    suppressed = await lookups.isDoNotContact(run.recipient);
  } catch {
    return lookupUnavailable();
  }
  if (suppressed) return { ok: false, retry: false, reason: "recipient_suppressed" };
  if (run.action_type !== "sms") return { ok: true };

  if (!isNorthAmericanNumber(run.recipient)) {
    return { ok: false, retry: false, reason: "sms_region_unsupported" };
  }

  if (REVIEW_TRIGGERS.has(run.trigger_event ?? "")) {
    let consented: boolean;
    try {
      consented = await lookups.hasSmsConsent(run.recipient);
    } catch {
      return lookupUnavailable();
    }
    if (!consented) return { ok: false, retry: false, reason: "sms_no_opt_in" };
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
