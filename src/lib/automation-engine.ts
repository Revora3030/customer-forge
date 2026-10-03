import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export const AUTOMATION_ACTIONS = [
  { value: "email", label: "Send email", hint: "Goes to the lead's email address." },
  { value: "sms", label: "Send text", hint: "Goes to the lead's mobile number." },
  { value: "task", label: "Create task", hint: "A reminder for you or your team." },
] as const;

export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number]["value"];

export const DELAY_PRESETS = [
  { minutes: 0, label: "Immediately" },
  { minutes: 15, label: "After 15 minutes" },
  { minutes: 60, label: "After 1 hour" },
  { minutes: 240, label: "After 4 hours" },
  { minutes: 1440, label: "After 1 day" },
  { minutes: 2880, label: "After 2 days" },
  { minutes: 10080, label: "After 7 days" },
  { minutes: 43200, label: "After 30 days" },
] as const;

export const delayLabel = (minutes: number) => {
  const preset = DELAY_PRESETS.find((d) => d.minutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `After ${minutes} minutes`;
  if (minutes < 1440) return `After ${Math.round(minutes / 60)} hours`;
  return `After ${Math.round(minutes / 1440)} days`;
};

export type AutomationContext = {
  organizationId: string;
  trigger: string;
  businessName?: string | null;
  lead?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    service_interest?: string | null;
    estimated_value?: number | null;
  } | null;
  appointment?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    starts_at: string;
  } | null;
};

/** Replaces {{tokens}} in a template with real lead / booking / business values. */
export function renderTemplate(template: string | null | undefined, ctx: AutomationContext) {
  if (!template) return "";
  const starts = ctx.appointment?.starts_at ? new Date(ctx.appointment.starts_at) : null;
  const tokens: Record<string, string> = {
    customer_name: ctx.lead?.name ?? ctx.appointment?.name ?? "there",
    first_name: (ctx.lead?.name ?? ctx.appointment?.name ?? "there").split(" ")[0] ?? "there",
    business_name: ctx.businessName ?? "us",
    service: ctx.lead?.service_interest ?? "your service",
    price: ctx.lead?.estimated_value
      ? `$${Math.round(Number(ctx.lead.estimated_value))}`
      : "your estimate",
    appointment_date: starts ? starts.toLocaleDateString() : "",
    appointment_time: starts
      ? starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "",
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) =>
    key.toLowerCase() in tokens ? tokens[key.toLowerCase()]! : match,
  );
}

export const AUTOMATION_TOKENS = [
  "{{first_name}}",
  "{{customer_name}}",
  "{{business_name}}",
  "{{service}}",
  "{{price}}",
  "{{appointment_date}}",
  "{{appointment_time}}",
];

/**
 * Queues every step of every active automation listening to `trigger`, honouring
 * each step's configured delay. Steps with no delay are delivered right away.
 */
export async function enqueueAutomations(
  client: Client,
  ctx: AutomationContext,
  options: ProcessOptions = {},
) {
  const { data: automations } = await client
    .from("automations")
    .select(
      "id, name, trigger_event, is_active, automation_steps!automation_steps_automation_id_fkey(id, sort_order, delay_minutes, action_type, channel, subject, body)",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("trigger_event", ctx.trigger)
    .eq("is_active", true);

  const rows: Database["public"]["Tables"]["automation_runs"]["Insert"][] = [];
  const now = Date.now();

  for (const automation of automations ?? []) {
    const steps = [...(automation.automation_steps ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    for (const step of steps) {
      const action = (step.channel ?? step.action_type ?? "task") as AutomationAction;
      const recipient =
        action === "email"
          ? (ctx.lead?.email ?? ctx.appointment?.email ?? null)
          : action === "sms"
            ? (ctx.lead?.phone ?? ctx.appointment?.phone ?? null)
            : null;
      rows.push({
        organization_id: ctx.organizationId,
        automation_id: automation.id,
        step_id: step.id,
        lead_id: ctx.lead?.id ?? null,
        appointment_id: ctx.appointment?.id ?? null,
        trigger_event: ctx.trigger,
        action_type: action,
        recipient,
        subject: renderTemplate(step.subject, ctx) || automation.name,
        body: renderTemplate(step.body, ctx),
        scheduled_for: new Date(now + (step.delay_minutes ?? 0) * 60_000).toISOString(),
        status: "queued",
      });
    }
  }

  if (!rows.length) return { queued: 0, sent: 0, skipped: 0, failed: 0 };
  const { error: queueError } = await client.from("automation_runs").insert(rows);
  if (queueError) throw new Error(`Couldn't queue the follow-up steps: ${queueError.message}`);
  const result = await processDueRuns(client, ctx.organizationId, options);
  return { queued: rows.length, ...result };
}

/** Injected by server code so real messages are sent. Omitted on the client. */
export type RunDelivery = (run: {
  id: string;
  action_type: string;
  recipient: string | null;
  subject: string | null;
  body: string | null;
}) => Promise<
  { ok: true } | { ok: false; retry: boolean; reason: string; retryAfterSeconds?: number }
>;

export type ProcessOptions = { deliver?: RunDelivery; businessName?: string | null };

const REASON_TEXT: Record<string, string> = {
  no_email_address: "no email address on file",
  no_phone_number: "no phone number on file",
  invalid_phone_number: "the phone number isn't a valid mobile number",
  recipient_suppressed: "the recipient unsubscribed or previously bounced",
  sms_provider_not_connected: "no text-message provider is connected yet",
  sms_provider_not_configured: "the text-message provider isn't finished configuring",
};

/**
 * Delivers everything that is due. Email and SMS steps are handed to the
 * injected `deliver` function; without one (client-side calls) message steps are
 * left queued rather than falsely marked sent. Task steps become notifications.
 */
export async function processDueRuns(
  client: Client,
  organizationId: string,
  options: ProcessOptions = {},
) {
  const { data: due } = await client
    .from("automation_runs")
    .select("id, action_type, recipient, subject, body, lead_id, appointment_id")
    .eq("organization_id", organizationId)
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(100);

  if (!due?.length) return { sent: 0, skipped: 0, failed: 0 };

  const nowIso = new Date().toISOString();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const activities: Database["public"]["Tables"]["lead_activities"]["Insert"][] = [];
  const notifications: Database["public"]["Tables"]["notifications"]["Insert"][] = [];

  for (const run of due) {
    const isMessage = run.action_type === "email" || run.action_type === "sms";

    // No delivery transport available here: leave it queued for the server pass.
    if (isMessage && !options.deliver) continue;

    const outcome = isMessage ? await options.deliver!(run) : ({ ok: true } as { ok: true });

    if (!outcome.ok && outcome.retry) {
      // Transient: push it out and try again on the next pass.
      const delaySeconds =
        "retryAfterSeconds" in outcome && outcome.retryAfterSeconds
          ? outcome.retryAfterSeconds
          : 60;
      await client
        .from("automation_runs")
        .update({
          scheduled_for: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        })
        .eq("id", run.id);
      continue;
    }

    const delivered = outcome.ok;
    if (delivered) sent += 1;
    else if (run.recipient) failed += 1;
    else skipped += 1;

    // Only the pass that moves the run out of "queued" records it: two passes
    // running at once (dashboard + scheduler) must not log it twice. The email
    // itself is already single-send through its idempotency key.
    const { data: claimed } = await client
      .from("automation_runs")
      .update({
        status: delivered ? "sent" : run.recipient ? "failed" : "skipped",
        sent_at: delivered ? nowIso : null,
      })
      .eq("id", run.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) {
      if (delivered) sent -= 1;
      else if (run.recipient) failed -= 1;
      else skipped -= 1;
      continue;
    }

    if (run.lead_id) {
      const reason = !outcome.ok ? (REASON_TEXT[outcome.reason] ?? outcome.reason) : "";
      activities.push({
        organization_id: organizationId,
        lead_id: run.lead_id,
        kind: `automation_${run.action_type}`,
        body: delivered
          ? `${run.subject ?? "Follow-up"} — sent automatically${run.recipient ? ` to ${run.recipient}` : ""}`
          : `${run.subject ?? "Follow-up"} — not sent: ${reason}`,
      });
    }

    if (run.action_type === "task" && delivered) {
      notifications.push({
        organization_id: organizationId,
        title: run.subject ?? "Automation task",
        body: run.body ?? null,
        kind: "task",
        link: "/app/leads",
      });
    }
  }

  if (activities.length) {
    const { error } = await client.from("lead_activities").insert(activities);
    if (error) console.error("automation activity log failed", error.message);
  }
  if (notifications.length) {
    const { error } = await client.from("notifications").insert(notifications);
    if (error) console.error("automation task notifications failed", error.message);
  }

  return { sent, skipped, failed };
}

/** Ready-made automations a business can switch on in one click. */
export const AUTOMATION_RECIPES: {
  name: string;
  trigger_event: string;
  description: string;
  steps: { delay_minutes: number; action_type: AutomationAction; subject: string; body: string }[];
}[] = [
  {
    name: "New lead speed-to-lead",
    trigger_event: "lead_created",
    description: "Reply in seconds, then chase twice so nobody goes cold.",
    steps: [
      {
        delay_minutes: 0,
        action_type: "sms",
        subject: "Thanks for reaching out",
        body: "Hi {{first_name}}, this is {{business_name}}. Thanks for your {{service}} enquiry — I'll call you shortly to confirm details.",
      },
      {
        delay_minutes: 60,
        action_type: "task",
        subject: "Call {{customer_name}}",
        body: "Ring {{customer_name}} about {{service}} ({{price}}).",
      },
      {
        delay_minutes: 2880,
        action_type: "email",
        subject: "Still want your {{service}} booked?",
        body: "Hi {{first_name}}, just following up on your {{service}} request. Reply here and we'll get you on the calendar.",
      },
    ],
  },
  {
    name: "Quote follow-up sequence",
    trigger_event: "quote_requested",
    description: "Send the estimate, then follow up on day 2 and day 5.",
    steps: [
      {
        delay_minutes: 0,
        action_type: "email",
        subject: "Your {{service}} estimate",
        body: "Hi {{first_name}}, here's your estimate: {{price}}. Want it booked in? Just reply.",
      },
      {
        delay_minutes: 2880,
        action_type: "sms",
        subject: "Quote check-in",
        body: "Hi {{first_name}}, any questions about your {{service}} quote?",
      },
      {
        delay_minutes: 7200,
        action_type: "task",
        subject: "Last call on {{customer_name}}'s quote",
        body: "Decide whether to discount, follow up or mark lost.",
      },
    ],
  },
  {
    name: "Booking confirmation & reminder",
    trigger_event: "booking_created",
    description: "Confirm instantly and remind the day before to kill no-shows.",
    steps: [
      {
        delay_minutes: 0,
        action_type: "email",
        subject: "You're booked for {{appointment_date}}",
        body: "Hi {{first_name}}, your {{service}} is booked for {{appointment_date}} at {{appointment_time}}. See you then — {{business_name}}.",
      },
      {
        delay_minutes: 1440,
        action_type: "sms",
        subject: "Appointment reminder",
        body: "Reminder: {{business_name}} is scheduled with you on {{appointment_date}} at {{appointment_time}}.",
      },
    ],
  },
  {
    name: "Review request after the job",
    trigger_event: "appointment_completed",
    description: "Ask for the review while the work is still fresh.",
    steps: [
      {
        delay_minutes: 120,
        action_type: "sms",
        subject: "How did we do?",
        body: "Thanks for choosing {{business_name}}, {{first_name}}! A quick review helps us a lot.",
      },
      {
        delay_minutes: 4320,
        action_type: "email",
        subject: "Book your next {{service}}",
        body: "Hi {{first_name}}, ready for your next {{service}}? Reply and we'll hold a slot.",
      },
    ],
  },
];
