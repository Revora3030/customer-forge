import { EmailAPIError } from "@lovable.dev/email-js";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

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
};

const isE164ish = (v: string) => /^\+?[0-9][0-9\s().-]{6,19}$/.test(v);

/** Real email delivery through Lovable's managed sending. */
export async function deliverEmail(
  run: DeliverableRun,
  ctx: { businessName?: string | null; replyTo?: string | null } = {},
): Promise<DeliveryResult> {
  const to = (run.recipient ?? "").trim();
  if (!to) return { ok: false, retry: false, reason: "no_email_address" };
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
 * Text-message delivery, resolved through the capability registry so the reason
 * is always the true one: no provider implemented, awaiting authorization, or
 * blocked because it bills per message. Delivery is never reported unless a
 * provider confirms it — and none can yet, so this never claims success.
 */
export async function deliverSms(run: DeliverableRun): Promise<DeliveryResult> {
  const to = (run.recipient ?? "").trim();
  if (!to) return { ok: false, retry: false, reason: "no_phone_number" };
  if (!isE164ish(to)) return { ok: false, retry: false, reason: "invalid_phone_number" };

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
  ctx: { businessName?: string | null; replyTo?: string | null } = {},
): Promise<DeliveryResult> {
  if (run.action_type === "email") return deliverEmail(run, ctx);
  if (run.action_type === "sms") return deliverSms(run);
  return { ok: true };
}

/** Owner-facing alert when a new lead / quote / booking lands. */
export async function sendLeadAlert(
  to: string,
  data: Record<string, unknown>,
  idempotencyKey: string,
): Promise<DeliveryResult> {
  if (!to) return { ok: false, retry: false, reason: "no_email_address" };
  try {
    const result = await sendTemplateEmail("lead-alert", to, {
      idempotencyKey,
      templateData: data,
    });
    return result.sent ? { ok: true } : { ok: false, retry: false, reason: result.reason };
  } catch (error) {
    if (error instanceof EmailAPIError) {
      return { ok: false, retry: error.status === 429, reason: error.code ?? "email_error" };
    }
    console.error("lead alert failed", error);
    return { ok: false, retry: true, reason: "email_transport_error" };
  }
}
