import { EmailAPIError } from "@lovable.dev/email-js";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import type { ConsentLookups } from "@/lib/automation-consent";

/**
 * Outcome of one delivery attempt.
 * - ok: provider accepted the message.
 * - retry: transient (rate limit, provider blip) — the run stays queued.
 * - otherwise: permanent for this run; it is recorded as skipped/failed with a reason.
 */
export type DeliveryResult =
  { ok: true } | { ok: false; retry: boolean; reason: string; retryAfterSeconds?: number };

export type DeliverableRun = {
  id: string;
  action_type: string;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  /** Which event queued the run; review requests need SMS opt-in. */
  trigger_event?: string | null;
  /** Start of the linked appointment; stale reminders are dropped. */
  appointment_starts_at?: string | null;
};

export type DeliveryContext = {
  businessName?: string | null;
  replyTo?: string | null;
  /** The business's state, so quiet hours use its zone alongside the number's area code. */
  businessState?: string | null;
};

type ConsentDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
};

/**
 * Consent lookups for the automation gate (src/lib/automation-consent.ts),
 * backed by the platform do-not-contact and consent lists. Those lists are
 * service-role only, so they are read with the admin client by exact value.
 *
 * Unlike the outreach helpers (which fold a read error into "blocked"), these
 * THROW on a read error: the gate then keeps the run queued and retries
 * (`consent_lookup_unavailable`) instead of recording a false "unsubscribed".
 */
export function automationConsentLookups(
  db: ConsentDb,
  helpers: {
    normalizeContact: (value: unknown) => { value: string; kind: "email" | "phone" } | null;
    smsAllowedNow: (now: Date, state: string | null | undefined, phone?: string | null) => boolean;
  },
  businessState: string | null = null,
): ConsentLookups {
  const read = async (table: string, column: string, value: string) => {
    const { data, error } = await db.from(table).select(column).eq("value", value).maybeSingle();
    if (error) throw new Error(`consent lookup failed: ${error.message ?? table}`);
    return data as Record<string, unknown> | null;
  };
  return {
    isDoNotContact: async (value) => {
      const contact = helpers.normalizeContact(value);
      if (!contact) return false;
      return Boolean(await read("prospect_do_not_contact", "value", contact.value));
    },
    hasSmsConsent: async (phone) => {
      const contact = helpers.normalizeContact(phone);
      if (!contact || contact.kind !== "phone") return false;
      return (await read("prospect_contact_consent", "sms", contact.value))?.["sms"] === true;
    },
    smsAllowedAt: (when, phone) => helpers.smsAllowedNow(when, businessState, phone),
  };
}

async function consentGate(run: DeliverableRun, recipient: string, ctx: DeliveryContext) {
  const [{ automationContactGate }, outreach, { supabaseAdmin }] = await Promise.all([
    import("@/lib/automation-consent"),
    import("@/lib/prospect-outreach.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  return automationContactGate(
    {
      action_type: run.action_type,
      recipient,
      trigger_event: run.trigger_event ?? null,
      appointment_starts_at: run.appointment_starts_at ?? null,
    },
    automationConsentLookups(supabaseAdmin as never, outreach, ctx.businessState ?? null),
  );
}

const isE164ish = (v: string) => /^\+?[0-9][0-9\s().-]{6,19}$/.test(v);

/** Real email delivery through Lovable's managed sending. */
export async function deliverEmail(
  run: DeliverableRun,
  ctx: DeliveryContext = {},
): Promise<DeliveryResult> {
  const to = (run.recipient ?? "").trim();
  if (!to) return { ok: false, retry: false, reason: "no_email_address" };
  const gate = await consentGate(run, to, ctx);
  if (!gate.ok) return gate;
  try {
    const result = await sendTemplateEmail("automation-message", to, {
      // Same run never sends twice, even if the processor runs concurrently.
      idempotencyKey: `automation-run-${run.id}`,
      templateData: {
        businessName: ctx.businessName ?? undefined,
        heading: run.subject ?? undefined,
        message: run.body ?? undefined,
      },
      ...(ctx.replyTo ? { replyTo: ctx.replyTo } : {}),
    });
    if (!result.sent) return { ok: false, retry: false, reason: result.reason };
    return { ok: true };
  } catch (error) {
    if (error instanceof EmailAPIError) {
      if (error.status === 429) {
        return {
          ok: false,
          retry: true,
          reason: "rate_limited",
          retryAfterSeconds: error.retryAfterSeconds ?? 60,
        };
      }
      // domain_not_verified / emails_disabled are server-side states: retry later
      // rather than burning the run.
      const retry = error.code === "domain_not_verified" || error.code === "emails_disabled";
      return { ok: false, retry, reason: error.code ?? `email_error_${error.status}` };
    }
    console.error("email delivery failed", error);
    return { ok: false, retry: true, reason: "email_transport_error" };
  }
}

/**
 * Text-message delivery. Workspace automations text through the platform's
 * Twilio account only when it is configured AND SMS_AUTOMATIONS_ENABLED=true,
 * because every text bills the platform; otherwise the reason comes from the
 * capability registry so it is always the true one. Delivery is reported only
 * when Twilio accepts the message.
 */
export async function deliverSms(run: DeliverableRun, ctx: DeliveryContext = {}): Promise<DeliveryResult> {
  const to = (run.recipient ?? "").trim();
  if (!to) return { ok: false, retry: false, reason: "no_phone_number" };
  if (!isE164ish(to)) return { ok: false, retry: false, reason: "invalid_phone_number" };

  const { sendTwilioSms, twilioConfig } = await import("@/lib/sms/twilio.server");
  if (twilioConfig() && process.env["SMS_AUTOMATIONS_ENABLED"]?.trim() === "true") {
    const { normalizePhone, withStopLine } = await import("@/lib/prospect-outreach.server");
    const phone = normalizePhone(to);
    if (!phone) return { ok: false, retry: false, reason: "invalid_phone_number" };
    const gate = await consentGate(run, phone, ctx);
    if (!gate.ok) return gate;
    const result = await sendTwilioSms(phone, withStopLine(run.body ?? ""));
    return result.ok ? { ok: true } : { ok: false, retry: result.retry, reason: result.reason };
  }

  const { resolveCapability } = await import("@/lib/integrations/registry.server");
  const resolution = await resolveCapability("messaging.sms");
  if (!resolution.provider) {
    return {
      ok: false,
      retry: false,
      reason:
        resolution.reason === "paid_provider_blocked_by_free_only"
          ? "sms_provider_blocked_by_cost_policy"
          : resolution.reason === "needs_connection"
            ? "sms_provider_not_connected"
            : "sms_provider_not_implemented",
    };
  }
  // A provider resolved but no send path exists yet: say so, never claim a send.
  return { ok: false, retry: false, reason: "sms_provider_not_configured" };
}

export async function deliverRun(
  run: DeliverableRun,
  ctx: DeliveryContext = {},
): Promise<DeliveryResult> {
  if (run.action_type === "email") return deliverEmail(run, ctx);
  if (run.action_type === "sms") return deliverSms(run, ctx);
  return { ok: true };
}


/** Visitor-facing confirmation after a public lead is durably saved. */
export async function sendLeadConfirmation(
  to: string,
  data: Record<string, unknown>,
  idempotencyKey: string,
  replyTo?: string | null,
): Promise<DeliveryResult> {
  if (!to) return { ok: false, retry: false, reason: "no_email_address" };
  try {
    const result = await sendTemplateEmail("lead-confirmation", to, {
      idempotencyKey,
      templateData: data,
      ...(replyTo ? { replyTo } : {}),
    });
    return result.sent ? { ok: true } : { ok: false, retry: false, reason: result.reason };
  } catch (error) {
    if (error instanceof EmailAPIError) {
      return {
        ok: false,
        retry: error.status === 429,
        reason: error.code ?? "email_error",
      };
    }
    console.error("lead confirmation failed", error);
    return { ok: false, retry: true, reason: "email_transport_error" };
  }
}


const ALERT_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const LEAD_ALERT_KEY = /^lead-alert-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Where an owner lands to open a lead from the alert email. */
export function leadUrlFor(leadId: string): string {
  return `https://revoragrowthsystems.com/app/leads?lead=${encodeURIComponent(leadId)}`;
}

/**
 * Owner-facing alert when a new lead / quote / booking lands.
 *
 * Reply-to is the visitor (explicit `replyTo`, else the alert's validated
 * `leadEmail`), so hitting Reply answers the customer instead of noreply@. A
 * per-lead key (`lead-alert-<uuid>`) also adds an "Open this lead" link.
 */
export async function sendLeadAlert(
  to: string,
  data: Record<string, unknown>,
  idempotencyKey: string,
  replyTo?: string | null,
): Promise<DeliveryResult> {
  if (!to) return { ok: false, retry: false, reason: "no_email_address" };
  const candidates = [replyTo, data["leadEmail"]].map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  const reply = candidates.find((value) => ALERT_EMAIL.test(value));
  const leadId = LEAD_ALERT_KEY.exec(idempotencyKey)?.[1];
  const templateData =
    leadId && typeof data["leadUrl"] !== "string" ? { ...data, leadUrl: leadUrlFor(leadId) } : data;
  try {
    const result = await sendTemplateEmail("lead-alert", to, {
      idempotencyKey,
      templateData,
      ...(reply ? { replyTo: reply } : {}),
    });
    return result.sent ? { ok: true } : { ok: false, retry: false, reason: result.reason };
  } catch (error) {
    if (error instanceof EmailAPIError) {
      return {
        ok: false,
        retry: error.status === 429,
        reason: error.code ?? (error.status === 429 ? "rate_limited" : "email_error"),
      };
    }
    console.error("lead alert failed", error);
    return { ok: false, retry: true, reason: "email_transport_error" };
  }
}
