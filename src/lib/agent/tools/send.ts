/**
 * PAI-12 send-to-customer tools (risk "send_external", owner scope).
 *
 * Each tool only wraps the one server path that already queues customer
 * messages (`automation-queue.server.ts`), which re-checks staff access with
 * the caller's own client, finds the record inside the session workspace,
 * builds the message from workspace data (the model never writes the text or
 * the recipient) and delivers through the consent-gated sender that skips
 * unsubscribed, STOP and bounced contacts.
 *
 * The registry never runs a send_external tool without a PAI-4 approval for
 * these exact arguments (`needs_approval`), so with no approval nothing is
 * queued. Changing any argument changes the hash, so an edit after approval
 * needs a new approval.
 *
 * Built here: reviews.request, quotes.send, bookings.reminder. Not built:
 * leads.follow_up (no separate server path exists beyond these) and
 * campaigns.send (no campaign sender exists yet); both need their own path
 * first. See docs/agent-send-tools.md.
 */
import { z } from "zod";
import { defineToolV2, type ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import type { QueueDeps, QueueResult } from "@/lib/automation-queue.server";
import { db } from "./shared";

export type SendDeps = () => Promise<QueueDeps>;

/** Service-role transport, loaded only when an approved send actually runs. */
export const defaultSendDeps: SendDeps = async () => {
  const [{ supabaseAdmin }, { deliverRun }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/messaging.server"),
  ]);
  return { admin: supabaseAdmin, deliverFor: (ctx) => (run) => deliverRun(run, ctx) } as QueueDeps;
};

/** Counts only: no recipient address, no message body goes back to the model. */
const counts = (result: QueueResult) => ({
  queued: result.queued,
  sent: result.sent,
  skipped: result.skipped,
  failed: result.failed,
  ...(result.duplicate ? { alreadyQueued: true } : {}),
});

const id = z.string().uuid();

export function sendTools(loadDeps: SendDeps = defaultSendDeps): ToolDefinitionV2<z.ZodType>[] {
  const reviewsRequest = defineToolV2({
    name: "reviews.request",
    description:
      "Ask one customer for a review after a completed job, by email or text. The wording comes from the business profile. Needs the owner's approval first.",
    risk: "send_external",
    scope: "owner",
    schema: z.strictObject({ appointmentId: id, channel: z.enum(["email", "sms"]) }),
    run: async (input, context) => {
      const { requestReviewFor } = await import("@/lib/automation-queue.server");
      const result = await requestReviewFor(
        db(context),
        context.userId,
        {
          organizationId: context.organizationId,
          appointmentId: input.appointmentId,
          channel: input.channel,
        },
        await loadDeps(),
      );
      return counts(result);
    },
  });

  const quotesSend = defineToolV2({
    name: "quotes.send",
    description:
      "Send the workspace's own quote follow-up automations to one lead that is at the quoted stage. Needs the owner's approval first.",
    risk: "send_external",
    scope: "owner",
    schema: z.strictObject({ leadId: id }),
    run: async (input, context) => {
      const { queueAutomationEventFor } = await import("@/lib/automation-queue.server");
      const result = await queueAutomationEventFor(
        db(context),
        context.userId,
        {
          organizationId: context.organizationId,
          trigger: "quote_requested",
          leadId: input.leadId,
          appointmentId: null,
        },
        await loadDeps(),
      );
      return counts(result);
    },
  });

  const bookingsReminder = defineToolV2({
    name: "bookings.reminder",
    description:
      "Send the workspace's own booking follow-up automations for one live (pending or confirmed) booking. Needs the owner's approval first.",
    risk: "send_external",
    scope: "owner",
    schema: z.strictObject({ appointmentId: id }),
    run: async (input, context) => {
      const { queueAutomationEventFor } = await import("@/lib/automation-queue.server");
      const result = await queueAutomationEventFor(
        db(context),
        context.userId,
        {
          organizationId: context.organizationId,
          trigger: "booking_created",
          leadId: null,
          appointmentId: input.appointmentId,
        },
        await loadDeps(),
      );
      return counts(result);
    },
  });

  return [reviewsRequest, quotesSend, bookingsReminder] as unknown as ToolDefinitionV2<z.ZodType>[];
}
