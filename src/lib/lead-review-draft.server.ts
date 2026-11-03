/**
 * Builds a review-request DRAFT for one completed lead that has no booking.
 *
 * This module is read-only by design. It never queues, saves or sends anything:
 * no automation run is written, no provider is called, no row is changed. It
 * only reads the lead, its bookings and the business profile with the caller's
 * own credentials, asks the existing consent gate (automation-consent.ts, the
 * same rules a queued review request goes through) whether each channel may be
 * offered, and returns wording the owner reviews and sends themselves.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { automationContactGate, type ConsentLookups } from "@/lib/automation-consent";
import { reviewRequestMessage } from "@/lib/automation-engine";
import { loadBusiness } from "@/lib/automation-queue.server";
import { requireOrgRole } from "@/lib/org-authz.server";
import {
  mailtoHref,
  smsHref,
  type ChannelDraft,
  type DraftBlockReason,
  type LeadReviewDraft,
} from "@/lib/lead-review-draft";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LeadReviewDraftInput = { organizationId: string; leadId: string };

export function validateLeadReviewDraftInput(input: unknown): LeadReviewDraftInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const organizationId = String(raw["organizationId"] ?? "").trim();
  const leadId = String(raw["leadId"] ?? "").trim();
  if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
  if (!UUID.test(leadId)) throw new Error("Pick the lead to ask for a review.");
  return { organizationId, leadId };
}

export type LeadReviewDraftDeps = {
  /** Consent lookups (read-only lists). A lookup that throws holds the draft back. */
  lookups: (businessState: string | null) => ConsentLookups;
  now?: () => Date;
};

export async function buildLeadReviewDraft(
  userDb: Db,
  userId: string,
  input: LeadReviewDraftInput,
  deps: LeadReviewDraftDeps,
): Promise<LeadReviewDraft> {
  const organizationId = await requireOrgRole(userDb, input.organizationId, userId, "staff");
  const business = await loadBusiness(userDb, organizationId);

  const { data: lead, error: leadError } = await userDb
    .from("leads")
    .select("id, name, email, phone, status")
    .eq("id", input.leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (leadError) throw new Error(`Couldn't load that lead: ${leadError.message}`);
  if (!lead) throw new Error("That lead wasn't found in this workspace.");
  if (lead.status !== "completed") return { eligible: false, reason: "not_completed" };

  // A lead with a booking is asked through its completed booking (Calendar), not here.
  const { data: bookings, error: bookingError } = await userDb
    .from("appointments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", lead.id)
    .limit(1);
  if (bookingError) throw new Error(`Couldn't check this lead's bookings: ${bookingError.message}`);
  if (bookings?.length) return { eligible: false, reason: "has_booking" };

  const message = reviewRequestMessage({
    customerName: lead.name ?? "",
    businessName: business.businessName,
    reviewLink: business.reviewLink,
  });
  const lookups = deps.lookups(business.businessState);
  const now = (deps.now ?? (() => new Date()))();

  const offer = async (channel: "email" | "sms", recipient: string | null | undefined): Promise<ChannelDraft> => {
    const to = recipient?.trim();
    if (!to) return { channel, allowed: false, reason: "no_contact" };
    const gate = await automationContactGate(
      { action_type: channel, recipient: to, trigger_event: "review_request" },
      lookups,
      now,
    );
    if (!gate.ok) return { channel, allowed: false, reason: gate.reason as DraftBlockReason };
    return {
      channel,
      allowed: true,
      recipient: to,
      subject: message.subject,
      body: message.body,
      href: channel === "email" ? mailtoHref(to, message.subject, message.body) : smsHref(to, message.body),
    };
  };

  return {
    eligible: true,
    leadName: lead.name ?? "",
    needsReviewLink: !business.reviewLink,
    drafts: [await offer("email", lead.email), await offer("sms", lead.phone)],
  };
}
