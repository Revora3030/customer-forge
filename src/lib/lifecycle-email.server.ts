import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Activity-based onboarding + retention emails.
 *
 * Runs only from the scheduled lifecycle job (pg_cron → POST
 * /api/public/jobs/lifecycle-email). For each active client workspace it
 * rebuilds the same onboarding journey the dashboard shows, then sends each
 * email at most ONCE per person, ever:
 *
 *   welcome          — right after the workspace exists
 *   setup_reminder   — one nudge naming the exact next action, days 1–21, until launched
 *   booking_followup — the first real booking that still needs confirming
 *   winback          — no activity for a week or more, nothing lost
 *
 * Never emailed: demo or suspended workspaces, Revora's own workspace, test
 * inboxes (+qa / +svcqa), and anyone who clicked the unsubscribe link
 * (lifecycle_email_optouts). Every send is logged in lifecycle_email_log; the
 * planner skips a (recipient, kind) that was ever logged, across all of that
 * person's workspaces, and the unique (org, kind, window) key stops two
 * overlapping runs from double-sending.
 */

import { onboardingJourney, type JourneyFacts } from "@/lib/onboarding-journey";
import { trialEndsAtMs } from "@/lib/trial";
import { FULL_ACCESS_TRIAL_DAYS } from "@/lib/offer";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { EmailAPIError } from "@lovable.dev/email-js";
import { isPlatformOwnerOrg } from "@/lib/platform-owner";

type Db = {
  from: SupabaseClient["from"];
};

const DAY = 86_400_000;
const SITE = "https://revoragrowthsystems.com";
const APP = `${SITE}/app`;
const ONCE = "once";
const CHUNK = 100;

export const LIFECYCLE_KINDS = ["welcome", "setup_reminder", "booking_followup", "winback"] as const;

/** Internal QA inboxes (name+qa@…, name+svcqa@…) never get lifecycle mail. */
export const isTestInbox = (email: string) => /\+(?:svc)?qa(?:[^@]*)@/i.test(email);

const chunks = <T,>(list: T[], size = CHUNK) => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Runs one `.in(column, ids)` query per chunk of ids and concatenates the rows.
 * Throws on any read error: planning from a partial view (say, a missing send
 * log or opt-out list) could email someone twice or after they unsubscribed.
 */
async function selectIn(
  db: Db,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  refine: (q: any) => any = (q) => q, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await refine(db.from(table as never).select(columns).in(column, part));
    if (error) throw new Error(`${table}: ${error.message ?? "read failed"}`);
    rows.push(...((data ?? []) as unknown[]));
  }
  return rows;
}

export type LifecycleSend = {
  organizationId: string;
  kind: "welcome" | "setup_reminder" | "booking_followup" | "winback";
  windowKey: string;
  recipient: string;
  template: string;
  data: Record<string, unknown>;
};

export type LifecycleResult = {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  details: { organizationId: string; kind: string; status: string; reason?: string }[];
};

const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const dateLabel = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

const groupCount = (rows: { organization_id: string }[] | null | undefined) => {
  const map = new Map<string, number>();
  for (const row of rows ?? [])
    map.set(row.organization_id, (map.get(row.organization_id) ?? 0) + 1);
  return map;
};

type ProfileRow = {
  organization_id: string;
  email: string | null;
  owner_email: string | null;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  service_area: string | null;
  description: string | null;
  hours: Record<string, unknown> | null;
  logo_url: string | null;
  primary_color: string | null;
};

type SettingRow = {
  organization_id: string;
  publish_state: string | null;
  domain_status: string | null;
  generated_at: string | null;
  updated_at: string | null;
};

const byOrg = <T extends { organization_id: string }>(rows: unknown) => {
  const list = (rows ?? []) as T[];
  const map = new Map<string, T>();
  for (const row of list) if (!map.has(row.organization_id)) map.set(row.organization_id, row);
  return map;
};

/** Builds every message that is currently due, without sending anything. */
export async function planLifecycleEmails(db: Db, limit = 500): Promise<LifecycleSend[]> {
  const { data: orgs, error: orgError } = await db
    .from("organizations")
    .select(
      "id, name, created_at, onboarding_completed, trial_ends_at, setup_paid_at, is_demo, is_suspended",
    )
    .eq("is_demo", false)
    .eq("is_suspended", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (orgError) throw new Error(`organizations: ${orgError.message}`);

  const list = ((orgs ?? []) as {
    id: string;
    name: string | null;
    created_at: string;
    onboarding_completed: boolean | null;
    trial_ends_at: string | null;
    setup_paid_at: string | null;
    is_demo?: boolean | null;
    is_suspended?: boolean | null;
  }[]).filter((o) => !o.is_demo && !o.is_suspended && !isPlatformOwnerOrg(o.id));
  if (list.length === 0) return [];
  const ids = list.map((o) => o.id);

  const [
    profileRows,
    settingRows,
    serviceData,
    mediaData,
    formData,
    automationData,
    reviewData,
    leadData,
    appointmentData,
    analyticsData,
    orgLog,
  ] = await Promise.all([
    selectIn(
      db,
      "business_profiles",
      "organization_id, email, owner_email, owner_name, phone, city, service_area, description, hours, logo_url, primary_color",
      "organization_id",
      ids,
    ),
    selectIn(db, "website_settings", "organization_id, publish_state, domain_status, generated_at, updated_at", "organization_id", ids),
    selectIn(db, "services", "organization_id, bookable", "organization_id", ids),
    selectIn(db, "media", "organization_id", "organization_id", ids),
    selectIn(db, "quote_forms", "organization_id, is_active", "organization_id", ids),
    selectIn(db, "automations", "organization_id, is_active", "organization_id", ids),
    selectIn(db, "reviews", "organization_id", "organization_id", ids),
    selectIn(db, "leads", "organization_id, status, created_at", "organization_id", ids),
    selectIn(db, "appointments", "organization_id, id, name, starts_at, status, created_at", "organization_id", ids, (q) =>
      q.gte("created_at", new Date(Date.now() - 2 * DAY).toISOString()),
    ),
    selectIn(db, "analytics_events", "organization_id", "organization_id", ids, (q) => q.limit(2000)),
    selectIn(db, "lifecycle_email_log", "organization_id, kind, window_key", "organization_id", ids, (q) =>
      q.in("kind", [...LIFECYCLE_KINDS]),
    ),
  ]);
  const profiles = { data: profileRows };
  const settings = { data: settingRows };
  const services = { data: serviceData };
  const media = { data: mediaData as { organization_id: string }[] };
  const forms = { data: formData };
  const automations = { data: automationData };
  const reviews = { data: reviewData as { organization_id: string }[] };
  const leads = { data: leadData };
  const appointments = { data: appointmentData };
  const analytics = { data: analyticsData as { organization_id: string }[] };
  const log = { data: orgLog };

  const profileMap = byOrg<ProfileRow>(profiles?.data);
  const settingsMap = byOrg<SettingRow>(settings?.data);
  const serviceRows = (services?.data ?? []) as {
    organization_id: string;
    bookable: boolean | null;
  }[];
  const mediaCount = groupCount(media?.data);
  const formRows = (forms?.data ?? []) as { organization_id: string; is_active: boolean | null }[];
  const automationRows = (automations?.data ?? []) as {
    organization_id: string;
    is_active: boolean | null;
  }[];
  const reviewCount = groupCount(reviews?.data);
  const analyticsCount = groupCount(analytics?.data);
  const leadRows = (leads?.data ?? []) as {
    organization_id: string;
    status: string;
    created_at: string;
  }[];
  const bookingRows = (appointments?.data ?? []) as {
    organization_id: string;
    id: string;
    name: string | null;
    starts_at: string;
    status: string;
    created_at: string;
  }[];

  const alreadySent = new Set(
    ((log?.data ?? []) as { organization_id: string; kind: string; window_key: string }[]).map(
      (r) => `${r.organization_id}|${r.kind}|${r.window_key}`,
    ),
  );

  // Who each workspace would email, minus QA inboxes.
  const recipientOf = new Map<string, string>();
  for (const org of list) {
    const profile = profileMap.get(org.id);
    const raw = (profile?.owner_email || profile?.email || "").trim();
    const recipient = raw.toLowerCase();
    if (recipient.includes("@") && !isTestInbox(recipient)) recipientOf.set(org.id, recipient);
  }
  const recipients = [...new Set(recipientOf.values())];
  const rawRecipients = [
    ...new Set(
      list.flatMap((o) => {
        const p = profileMap.get(o.id);
        return [p?.owner_email, p?.email].filter((v): v is string => has(v)).map((v) => v.trim());
      }),
    ),
  ];

  const [personLog, optOutRows] = await Promise.all([
    // Older rows may hold the address as typed, so match both spellings.
    selectIn(db, "lifecycle_email_log", "recipient, kind", "recipient", [...new Set([...recipients, ...rawRecipients])], (q) =>
      q.in("kind", [...LIFECYCLE_KINDS]),
    ),
    selectIn(db, "lifecycle_email_optouts", "email", "email", recipients, (q) => q.not("opted_out_at", "is", null)),
  ]);
  const optedOut = new Set((optOutRows as { email: string }[]).map((r) => r.email.toLowerCase()));
  // (recipient, kind) pairs already emailed from any workspace, plus this run's picks.
  const personSent = new Set(
    (personLog as { recipient: string | null; kind: string }[])
      .filter((r) => r.recipient)
      .map((r) => `${r.recipient!.trim().toLowerCase()}|${r.kind}`),
  );

  const now = Date.now();
  const planned: LifecycleSend[] = [];

  for (const org of list) {
    const profile = profileMap.get(org.id);
    const recipient = recipientOf.get(org.id);
    if (!recipient || optedOut.has(recipient)) continue;

    const setting = settingsMap.get(org.id);
    const orgServices = serviceRows.filter((s) => s.organization_id === org.id);
    const orgLeads = leadRows.filter((l) => l.organization_id === org.id);
    const orgBookings = bookingRows.filter((b) => b.organization_id === org.id);

    const facts: JourneyFacts = {
      signedUpAt: org.created_at,
      onboardingCompleted: Boolean(org.onboarding_completed),
      brandingReady: has(profile?.logo_url) && has(profile?.primary_color),
      siteGenerated: Boolean(setting?.generated_at) || setting?.publish_state === "published",
      sitePublished: setting?.publish_state === "published",
      servicesCount: orgServices.length,
      mediaCount: mediaCount.get(org.id) ?? 0,
      quoteFormCount: formRows.filter((f) => f.organization_id === org.id && f.is_active).length,
      bookableCount: orgServices.filter((s) => s.bookable).length,
      automationsCount: automationRows.filter((a) => a.organization_id === org.id && a.is_active)
        .length,
      leadsCount: orgLeads.length,
      reviewsCount: reviewCount.get(org.id) ?? 0,
      analyticsCount: analyticsCount.get(org.id) ?? 0,
      localSeo: {
        city: has(profile?.city),
        serviceArea: has(profile?.service_area),
        hours: Boolean(
          profile?.hours &&
          typeof profile.hours === "object" &&
          Object.keys(profile.hours).length > 0,
        ),
        phone: has(profile?.phone),
        description: has(profile?.description),
      },
      setupPaid: Boolean(org.setup_paid_at),
      domainConnected:
        setting?.domain_status === "connected" || setting?.domain_status === "ssl_active",
      now,
    };

    const plan = onboardingJourney(facts);
    const next = plan.next;
    const firstName = (profile?.owner_name ?? "").trim().split(" ")[0] || "";
    const businessName = org.name ?? "your business";
    // Resolve the window the app actually grants (never shorter than
    // created_at + FULL_ACCESS_TRIAL_DAYS), so a row stamped under an older,
    // shorter trial can't make an email promise less than the site does.
    const trialEndMs = org.trial_ends_at ? trialEndsAtMs(org) : null;
    const trialEndIso = trialEndMs !== null ? new Date(trialEndMs).toISOString() : null;
    const trialEnds = dateLabel(trialEndIso);
    const daysLeft = trialEndMs !== null ? Math.max(0, Math.ceil((trialEndMs - now) / DAY)) : 0;
    const ageDays = Math.floor((now - new Date(org.created_at).getTime()) / DAY);

    const push = (send: LifecycleSend) => {
      if (alreadySent.has(`${send.organizationId}|${send.kind}|${send.windowKey}`)) return;
      const person = `${send.recipient}|${send.kind}`;
      if (personSent.has(person)) return;
      personSent.add(person);
      planned.push(send);
    };

    // 1. Welcome — once, as soon as the workspace exists.
    push({
      organizationId: org.id,
      kind: "welcome",
      windowKey: "once",
      recipient,
      template: "lifecycle-welcome",
      data: {
        businessName,
        firstName,
        nextAction: next?.action,
        nextActionWhy: next?.why,
        actionUrl: next ? `${SITE}${next.to}` : APP,
        trialEnds,
        trialDays: FULL_ACCESS_TRIAL_DAYS,
      },
    });

    // 2. Setup reminder — once, naming the exact next action.
    if (next && !(facts.sitePublished && facts.setupPaid) && ageDays >= 1 && ageDays <= 21) {
      push({
        organizationId: org.id,
        kind: "setup_reminder",
        windowKey: ONCE,
        recipient,
        template: "lifecycle-setup-reminder",
        data: {
          businessName,
          firstName,
          nextAction: next.action,
          nextActionWhy: next.why,
          actionUrl: `${SITE}${next.to}`,
          trialEnds,
          daysLeft,
          trialDays: FULL_ACCESS_TRIAL_DAYS,
        },
      });
    }

    // 3. Booking follow-up — once, for the first real booking waiting to be confirmed.
    const booking = orgBookings
      .filter((b) => b.status === "pending")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (booking) {
      push({
        organizationId: org.id,
        kind: "booking_followup",
        windowKey: ONCE,
        recipient,
        template: "lifecycle-booking-followup",
        data: {
          businessName,
          bookingName: booking.name ?? "A customer",
          bookingWhen: new Date(booking.starts_at).toLocaleString("en-US", {
            weekday: "long",
            hour: "numeric",
            minute: "2-digit",
          }),
        },
      });
    }

    // 4. Win-back — once, after a week or more of no activity.
    const lastTouch = Math.max(
      new Date(setting?.updated_at ?? org.created_at).getTime(),
      ...orgLeads.map((l) => new Date(l.created_at).getTime()),
      ...orgBookings.map((b) => new Date(b.created_at).getTime()),
    );
    const quietDays = Math.floor((now - lastTouch) / DAY);
    if (quietDays >= 7 && next) {
      push({
        organizationId: org.id,
        kind: "winback",
        windowKey: ONCE,
        recipient,
        template: "lifecycle-winback",
        data: {
          businessName,
          daysAway: quietDays,
          leadCount: orgLeads.filter((l) => l.status === "new").length,
          nextAction: next.action,
          nextActionWhy: next.why,
          actionUrl: `${SITE}${next.to}`,
        },
      });
    }
  }

  return planned;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{24,80}$/;

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const lifecycleUnsubscribeUrl = (token: string) => `${SITE}/unsubscribe/lifecycle/${token}`;

/**
 * The recipient's stable unsubscribe token, created on first use. Returns
 * "opted_out" when they already unsubscribed and null when it can't be stored
 * (the caller then skips the send: no email goes out without a working link).
 */
export async function lifecycleUnsubscribeToken(db: Db, email: string): Promise<string | "opted_out" | null> {
  const address = email.trim().toLowerCase();
  const read = async () => {
    const { data, error } = await db
      .from("lifecycle_email_optouts" as never)
      .select("token, opted_out_at")
      .eq("email", address)
      .maybeSingle();
    if (error) return null;
    return data as { token: string; opted_out_at: string | null } | null;
  };
  let row = await read();
  if (!row) {
    await db.from("lifecycle_email_optouts" as never).insert({ email: address, token: newToken() } as never);
    row = await read(); // re-read: a concurrent run may have won the insert
  }
  if (!row) return null;
  return row.opted_out_at ? "opted_out" : row.token;
}

/** Marks the address behind a lifecycle unsubscribe token as opted out. False for an unknown token. */
export async function unsubscribeLifecycleByToken(db: Db, token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const { data, error } = await db
    .from("lifecycle_email_optouts" as never)
    .select("email, opted_out_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { email: string; opted_out_at: string | null } | null;
  if (!row) return false;
  if (!row.opted_out_at) {
    const { error: updateError } = await db
      .from("lifecycle_email_optouts" as never)
      .update({ opted_out_at: new Date().toISOString() } as never)
      .eq("token", token);
    if (updateError) throw new Error(updateError.message);
  }
  return true;
}

/** Sends every due lifecycle email and records the outcome. Called only by the scheduled job. */
export async function runLifecycleEmails(db: Db, options: { limit?: number; max?: number } = {}) {
  const planned = await planLifecycleEmails(db, options.limit ?? 500);
  const queue = planned.slice(0, options.max ?? 25);
  const result: LifecycleResult = {
    scanned: planned.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const send of queue) {
    const token = await lifecycleUnsubscribeToken(db, send.recipient);
    if (token === null || token === "opted_out") {
      result.skipped += 1;
      result.details.push({
        organizationId: send.organizationId,
        kind: send.kind,
        status: "skipped",
        reason: token === "opted_out" ? "unsubscribed" : "unsubscribe_link_unavailable",
      });
      continue;
    }

    // Claim the slot first: the unique index makes a double send impossible even
    // if two runs overlap.
    const { error: claimError } = await db.from("lifecycle_email_log").insert({
      organization_id: send.organizationId,
      kind: send.kind,
      window_key: send.windowKey,
      recipient: send.recipient,
      status: "sending",
    });
    if (claimError) {
      result.skipped += 1;
      result.details.push({
        organizationId: send.organizationId,
        kind: send.kind,
        status: "already_logged",
      });
      continue;
    }

    const finish = async (status: string, detail?: string) => {
      await db
        .from("lifecycle_email_log")
        .update({ status, detail: detail ?? null })
        .eq("organization_id", send.organizationId)
        .eq("kind", send.kind)
        .eq("window_key", send.windowKey);
    };

    try {
      const outcome = await sendTemplateEmail(send.template, send.recipient, {
        idempotencyKey: `lifecycle-${send.organizationId}-${send.kind}-${send.windowKey}`,
        templateData: { ...send.data, unsubscribeUrl: lifecycleUnsubscribeUrl(token) },
      });
      if (outcome.sent) {
        result.sent += 1;
        await finish("sent");
        result.details.push({
          organizationId: send.organizationId,
          kind: send.kind,
          status: "sent",
        });
      } else {
        result.skipped += 1;
        await finish("skipped", outcome.reason);
        result.details.push({
          organizationId: send.organizationId,
          kind: send.kind,
          status: "skipped",
          reason: outcome.reason,
        });
      }
    } catch (error) {
      const reason =
        error instanceof EmailAPIError
          ? (error.code ?? `email_error_${error.status}`)
          : error instanceof Error
            ? error.message.slice(0, 200)
            : "unknown_error";
      result.failed += 1;
      // Release the slot so a later run can retry a transient failure.
      await db
        .from("lifecycle_email_log")
        .delete()
        .eq("organization_id", send.organizationId)
        .eq("kind", send.kind)
        .eq("window_key", send.windowKey);
      result.details.push({
        organizationId: send.organizationId,
        kind: send.kind,
        status: "failed",
        reason,
      });
    }
  }

  return result;
}
