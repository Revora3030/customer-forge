/**
 * The ONLY way a signed-in workspace user causes automation messages to be
 * queued. Browsers can no longer write `automation_runs` (see migration
 * 20261021120000): every run is built here from the workspace's own
 * automation definitions and tenant rows, so the trigger event, recipient,
 * subject and body are never taken from the request.
 *
 * - The caller must hold staff+ in the workspace (checked with their own
 *   credentials through `requireOrgRole`, so RLS also applies).
 * - Leads and appointments are read with the caller's client and filtered by
 *   organization_id; a record from another workspace is "not found".
 * - The trigger must match the record's real state (e.g. a completion follow-up
 *   needs a completed appointment), and a trigger already queued for the same
 *   record is not queued twice.
 * - Runs are written with the service-role client only after those checks.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  enqueueAutomations,
  processDueRuns,
  reviewRequestMessage,
  type AutomationContext,
  type RunDelivery,
} from "@/lib/automation-engine";
import { requireOrgRole } from "@/lib/org-authz.server";
import { effectiveReviewLink, placeIdFromGeneration } from "@/lib/google-review-link";
import {
  REVIEW_SEQUENCE_TRIGGER,
  feedbackUrl,
  newFeedbackToken,
  reviewSequenceMessages,
  safeReviewUrl,
} from "@/lib/review-sequence";

type Db = SupabaseClient<Database>;

/** Triggers a workspace user may fire from the app. Public-site triggers stay server-only. */
export const CLIENT_QUEUE_TRIGGERS = ["quote_requested", "booking_created", "appointment_completed"] as const;
export type ClientQueueTrigger = (typeof CLIENT_QUEUE_TRIGGERS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value).trim();
  if (!UUID.test(id)) throw new Error(`Invalid ${label}`);
  return id;
};
const requiredOrg = (value: unknown) => {
  const id = String(value ?? "").trim();
  if (!UUID.test(id)) throw new Error("Invalid workspace");
  return id;
};

export type QueueEventInput = {
  organizationId: string;
  trigger: ClientQueueTrigger;
  leadId: string | null;
  appointmentId: string | null;
};

export function validateQueueEventInput(input: unknown): QueueEventInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const trigger = String(raw["trigger"] ?? "");
  if (!(CLIENT_QUEUE_TRIGGERS as readonly string[]).includes(trigger)) {
    throw new Error("That follow-up can't be started from here.");
  }
  const leadId = optionalId(raw["leadId"], "lead");
  const appointmentId = optionalId(raw["appointmentId"], "booking");
  if (!leadId && !appointmentId) throw new Error("Pick the lead or booking to follow up.");
  return { organizationId: requiredOrg(raw["organizationId"]), trigger: trigger as ClientQueueTrigger, leadId, appointmentId };
}

export type ReviewRequestInput = {
  organizationId: string;
  appointmentId: string;
  channel: "email" | "sms";
};

export function validateReviewRequestInput(input: unknown): ReviewRequestInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const appointmentId = optionalId(raw["appointmentId"], "booking");
  if (!appointmentId) throw new Error("Pick the completed job to ask about.");
  const channel = raw["channel"] === "sms" ? "sms" : raw["channel"] === "email" ? "email" : null;
  if (!channel) throw new Error("Choose email or text.");
  return { organizationId: requiredOrg(raw["organizationId"]), appointmentId, channel };
}

export type QueueDeps = {
  /** Service-role client: the only writer of automation_runs. */
  admin: Db;
  /** Builds the delivery transport once the business context is known. */
  deliverFor: (ctx: { businessName: string | null; replyTo: string | null; businessState: string | null }) => RunDelivery;
};

export async function loadBusiness(userDb: Db, organizationId: string) {
  const [{ data: org, error: orgError }, { data: profile, error: profileError }] = await Promise.all([
    userDb.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    userDb
      .from("business_profiles")
      .select("email, owner_email, state, review_link, review_sequence_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);
  if (orgError) throw new Error(`Couldn't load the workspace: ${orgError.message}`);
  if (!org?.id) throw new Error("Workspace not found");
  if (profileError) throw new Error(`Couldn't load the business profile: ${profileError.message}`);
  let reviewLink: string | null = profile?.review_link?.trim() || null;
  if (!reviewLink) {
    // No saved link: fall back to the free Google writereview link when the
    // workspace came from a Google listing (place ID on the prospect demo).
    const { data: settings } = await userDb
      .from("website_settings")
      .select("generation")
      .eq("organization_id", organizationId)
      .maybeSingle();
    reviewLink = effectiveReviewLink(null, placeIdFromGeneration((settings as { generation?: unknown } | null)?.generation));
  }
  return {
    businessName: org.name ?? null,
    replyTo: profile?.email ?? profile?.owner_email ?? null,
    businessState: profile?.state ?? null,
    reviewLink,
    reviewSequenceEnabled: profile?.review_sequence_enabled === true,
  };
}

async function loadAppointment(userDb: Db, organizationId: string, id: string) {
  const { data, error } = await userDb
    .from("appointments")
    .select("id, name, email, phone, starts_at, status, lead_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load that booking: ${error.message}`);
  if (!data) throw new Error("That booking wasn't found in this workspace.");
  return data;
}

async function loadLead(userDb: Db, organizationId: string, id: string) {
  const { data, error } = await userDb
    .from("leads")
    .select("id, name, email, phone, service_interest, estimated_value, status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load that lead: ${error.message}`);
  if (!data) throw new Error("That lead wasn't found in this workspace.");
  return data;
}

export type ReviewSequenceOutcome = {
  started: boolean;
  reason?: "off" | "no_review_link" | "no_email" | "custom_automation" | "already_asked" | "error";
};

export type QueueResult = {
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicate?: boolean;
  reviewSequence?: ReviewSequenceOutcome;
};

/**
 * Starts the built-in post-job review sequence for a completed booking (see
 * review-sequence.ts): one review_feedback_requests row with a private token,
 * then two queued email runs (1 hour, day 3) that the scheduled sweep
 * delivers through the normal consent-gated path. Runs only when the owner
 * switched it on and saved a review link, the booking has an email, the
 * workspace has no active "Appointment completed" automation of its own, and
 * this job was never asked before. Service-role client only.
 */
export async function startReviewSequence(
  admin: Db,
  input: {
    organizationId: string;
    appointment: { id: string; name: string; email: string | null; lead_id: string | null };
    business: { businessName: string | null; reviewLink: string | null; reviewSequenceEnabled: boolean };
  },
  now = Date.now(),
): Promise<ReviewSequenceOutcome> {
  const { organizationId, appointment, business } = input;
  if (!business.reviewSequenceEnabled) return { started: false, reason: "off" };
  if (!safeReviewUrl(business.reviewLink)) return { started: false, reason: "no_review_link" };
  const email = appointment.email?.trim();
  if (!email) return { started: false, reason: "no_email" };

  const { data: custom, error: customError } = await admin
    .from("automations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("trigger_event", "appointment_completed")
    .eq("is_active", true)
    .limit(1);
  if (customError) throw new Error(`Couldn't check the workspace's automations: ${customError.message}`);
  if (custom?.length) return { started: false, reason: "custom_automation" };

  const { data: asked, error: askedError } = await admin
    .from("automation_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("appointment_id", appointment.id)
    .eq("trigger_event", REVIEW_SEQUENCE_TRIGGER)
    .in("status", ["queued", "sent"])
    .limit(1);
  if (askedError) throw new Error(`Couldn't check earlier review requests: ${askedError.message}`);
  if (asked?.length) return { started: false, reason: "already_asked" };

  const token = newFeedbackToken();
  // UNIQUE (organization_id, appointment_id): a second completion of the same job can't start a second sequence.
  const { error: claimError } = await admin.from("review_feedback_requests").insert({
    organization_id: organizationId,
    appointment_id: appointment.id,
    lead_id: appointment.lead_id,
    customer_name: appointment.name.trim().slice(0, 200) || "Customer",
    token,
  });
  if (claimError) return { started: false, reason: "already_asked" };

  const runs = reviewSequenceMessages({
    customerName: appointment.name,
    businessName: business.businessName,
    url: feedbackUrl(token),
  }).map((step) => ({
    organization_id: organizationId,
    lead_id: appointment.lead_id,
    appointment_id: appointment.id,
    trigger_event: REVIEW_SEQUENCE_TRIGGER,
    action_type: "email",
    recipient: email,
    subject: step.subject,
    body: step.body,
    scheduled_for: new Date(now + step.delayMinutes * 60_000).toISOString(),
    status: "queued",
  }));
  const { error: runError } = await admin.from("automation_runs").insert(runs);
  if (runError) throw new Error(`Couldn't queue the review emails: ${runError.message}`);
  return { started: true };
}

/** Once a customer has rated, the day-3 reminder is not sent. Service-role client only. */
export async function skipQueuedReviewRuns(admin: Db, organizationId: string, appointmentId: string): Promise<void> {
  const { error } = await admin
    .from("automation_runs")
    .update({ status: "skipped" })
    .eq("organization_id", organizationId)
    .eq("appointment_id", appointmentId)
    .eq("trigger_event", REVIEW_SEQUENCE_TRIGGER)
    .eq("status", "queued");
  if (error) console.warn("review reminder skip failed", error.message);
}

export async function queueAutomationEventFor(
  userDb: Db,
  userId: string,
  input: QueueEventInput,
  deps: QueueDeps,
): Promise<QueueResult> {
  const organizationId = await requireOrgRole(userDb, input.organizationId, userId, "staff");
  const business = await loadBusiness(userDb, organizationId);
  const appointment = input.appointmentId
    ? await loadAppointment(userDb, organizationId, input.appointmentId)
    : null;
  const leadRow = input.leadId ? await loadLead(userDb, organizationId, input.leadId) : null;
  if (leadRow && appointment?.lead_id && appointment.lead_id !== leadRow.id) {
    throw new Error("That lead and booking don't belong together.");
  }

  // The trigger must describe what really happened to the record.
  if (input.trigger === "appointment_completed" && appointment?.status !== "completed") {
    throw new Error("Only a completed booking starts the completion follow-up.");
  }
  if (input.trigger === "booking_created") {
    const live = appointment
      ? appointment.status === "pending" || appointment.status === "confirmed"
      : leadRow?.status === "booked";
    if (!live) throw new Error("Only a live booking starts the booking follow-up.");
  }
  if (input.trigger === "quote_requested" && leadRow?.status !== "quoted") {
    throw new Error("Only a quoted lead starts the quote follow-up.");
  }

  // The built-in review sequence never blocks the workspace's own follow-ups.
  let reviewSequence: ReviewSequenceOutcome | undefined;
  if (input.trigger === "appointment_completed" && appointment) {
    reviewSequence = await startReviewSequence(deps.admin, { organizationId, appointment, business }).catch((error) => {
      console.error("review sequence failed", error instanceof Error ? error.message : error);
      return { started: false, reason: "error" as const };
    });
  }

  // One queue per trigger per record: re-saving a status never re-messages.
  let existing = deps.admin
    .from("automation_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("trigger_event", input.trigger);
  existing = appointment
    ? existing.eq("appointment_id", appointment.id)
    : existing.eq("lead_id", leadRow!.id).eq("status", "queued");
  const { data: already, error: existingError } = await existing.limit(1);
  if (existingError) throw new Error(`Couldn't check earlier follow-ups: ${existingError.message}`);
  if (already?.length) return { queued: 0, sent: 0, skipped: 0, failed: 0, duplicate: true, ...(reviewSequence ? { reviewSequence } : {}) };

  const leadId = leadRow?.id ?? appointment?.lead_id ?? null;
  const ctx: AutomationContext = {
    organizationId,
    trigger: input.trigger,
    businessName: business.businessName,
    lead: leadRow
      ? {
          id: leadRow.id,
          name: leadRow.name,
          email: leadRow.email,
          phone: leadRow.phone,
          service_interest: leadRow.service_interest,
          estimated_value: leadRow.estimated_value,
        }
      : leadId && appointment
        ? { id: leadId, name: appointment.name, email: appointment.email, phone: appointment.phone }
        : null,
    appointment: appointment
      ? {
          id: appointment.id,
          name: appointment.name,
          email: appointment.email,
          phone: appointment.phone,
          starts_at: appointment.starts_at,
        }
      : null,
  };
  const result = await enqueueAutomations(deps.admin, ctx, {
    businessName: business.businessName,
    deliver: deps.deliverFor(business),
  });
  return reviewSequence ? { ...result, reviewSequence } : result;
}

export async function requestReviewFor(
  userDb: Db,
  userId: string,
  input: ReviewRequestInput,
  deps: QueueDeps,
): Promise<QueueResult> {
  const organizationId = await requireOrgRole(userDb, input.organizationId, userId, "staff");
  const business = await loadBusiness(userDb, organizationId);
  const appointment = await loadAppointment(userDb, organizationId, input.appointmentId);
  if (appointment.status !== "completed") throw new Error("Ask for a review once the job is completed.");
  const recipient = (input.channel === "email" ? appointment.email : appointment.phone)?.trim();
  if (!recipient) {
    throw new Error(
      input.channel === "email" ? "That booking has no email address." : "That booking has no phone number.",
    );
  }

  const { data: already, error: existingError } = await deps.admin
    .from("automation_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("appointment_id", appointment.id)
    .eq("trigger_event", "review_request")
    .in("status", ["queued", "sent"])
    .limit(1);
  if (existingError) throw new Error(`Couldn't check earlier review requests: ${existingError.message}`);
  if (already?.length) throw new Error("A review request for this job is already queued or sent.");

  const message = reviewRequestMessage({
    customerName: appointment.name,
    businessName: business.businessName,
    reviewLink: business.reviewLink,
  });
  const { error } = await deps.admin.from("automation_runs").insert({
    organization_id: organizationId,
    lead_id: appointment.lead_id,
    appointment_id: appointment.id,
    trigger_event: "review_request",
    action_type: input.channel,
    recipient,
    subject: message.subject,
    body: message.body,
    scheduled_for: new Date().toISOString(),
    status: "queued",
  });
  if (error) throw new Error(`Couldn't queue that review request: ${error.message}`);
  const result = await processDueRuns(deps.admin, organizationId, {
    businessName: business.businessName,
    deliver: deps.deliverFor(business),
  });
  return { queued: 1, ...result };
}
