import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Activity-based onboarding + retention emails.
 *
 * Runs from the lifecycle cron endpoint. For each active client workspace it
 * rebuilds the same onboarding journey the dashboard shows, then sends at most
 * one message per stage per workspace:
 *
 *   welcome          — right after the workspace exists
 *   setup_reminder   — daily nudge naming the exact next action, until launched
 *   booking_followup — a real booking landed and still needs confirming
 *   winback          — no activity for a week or more, nothing lost
 *
 * Every send is logged in lifecycle_email_log with a unique (org, kind, window)
 * key, so a retry or an overlapping run can never email the same client twice.
 */

import { onboardingJourney, type JourneyFacts } from "@/lib/onboarding-journey";
import { trialEndsAtMs } from "@/lib/trial";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { EmailAPIError } from "@lovable.dev/email-js";

type Db = {
  from: SupabaseClient["from"];
};

const DAY = 86_400_000;
const APP = "https://revoragrowthsystems.com/app";

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
export async function planLifecycleEmails(db: Db, limit = 40): Promise<LifecycleSend[]> {
  const { data: orgs } = await db
    .from("organizations")
    .select(
      "id, name, created_at, onboarding_completed, trial_ends_at, setup_paid_at, is_demo, is_suspended",
    )
    .eq("is_demo", false)
    .eq("is_suspended", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  const list = (orgs ?? []) as {
    id: string;
    name: string | null;
    created_at: string;
    onboarding_completed: boolean | null;
    trial_ends_at: string | null;
    setup_paid_at: string | null;
  }[];
  if (list.length === 0) return [];
  const ids = list.map((o) => o.id);

  const [
    profiles,
    settings,
    services,
    media,
    forms,
    automations,
    reviews,
    leads,
    appointments,
    analytics,
    log,
  ] = await Promise.all([
    db
      .from("business_profiles")
      .select(
        "organization_id, email, owner_email, owner_name, phone, city, service_area, description, hours, logo_url, primary_color",
      )
      .in("organization_id", ids),
    db
      .from("website_settings")
      .select("organization_id, publish_state, domain_status, generated_at, updated_at")
      .in("organization_id", ids),
    db.from("services").select("organization_id, bookable").in("organization_id", ids),
    db.from("media").select("organization_id").in("organization_id", ids),
    db.from("quote_forms").select("organization_id, is_active").in("organization_id", ids),
    db.from("automations").select("organization_id, is_active").in("organization_id", ids),
    db.from("reviews").select("organization_id").in("organization_id", ids),
    db.from("leads").select("organization_id, status, created_at").in("organization_id", ids),
    db
      .from("appointments")
      .select("organization_id, id, name, starts_at, status, created_at")
      .in("organization_id", ids)
      .gte("created_at", new Date(Date.now() - 2 * DAY).toISOString()),
    db.from("analytics_events").select("organization_id").in("organization_id", ids).limit(2000),
    db
      .from("lifecycle_email_log")
      .select("organization_id, kind, window_key")
      .in("organization_id", ids),
  ]);

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

  const now = Date.now();
  const planned: LifecycleSend[] = [];

  for (const org of list) {
    const profile = profileMap.get(org.id);
    const recipient = (profile?.owner_email || profile?.email || "").trim();
    if (!recipient) continue;

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
        actionUrl: next ? `https://revoragrowthsystems.com${next.to}` : APP,
        trialEnds,
      },
    });

    // 2. Setup reminder — one per day, naming today's exact next action.
    if (next && !(facts.sitePublished && facts.setupPaid) && ageDays >= 1 && ageDays <= 21) {
      push({
        organizationId: org.id,
        kind: "setup_reminder",
        windowKey: `day-${ageDays}-${next.key}`,
        recipient,
        template: "lifecycle-setup-reminder",
        data: {
          businessName,
          firstName,
          nextAction: next.action,
          nextActionWhy: next.why,
          actionUrl: `https://revoragrowthsystems.com${next.to}`,
          trialEnds,
          daysLeft,
        },
      });
    }

    // 3. Booking follow-up — a real booking is waiting to be confirmed.
    for (const booking of orgBookings) {
      if (booking.status !== "pending") continue;
      push({
        organizationId: org.id,
        kind: "booking_followup",
        windowKey: `appointment-${booking.id}`,
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

    // 4. Win-back — quiet for a week or more, at 7 / 14 / 30 days.
    const lastTouch = Math.max(
      new Date(setting?.updated_at ?? org.created_at).getTime(),
      ...orgLeads.map((l) => new Date(l.created_at).getTime()),
      ...orgBookings.map((b) => new Date(b.created_at).getTime()),
    );
    const quietDays = Math.floor((now - lastTouch) / DAY);
    const bucket = quietDays >= 30 ? 30 : quietDays >= 14 ? 14 : quietDays >= 7 ? 7 : 0;
    if (bucket > 0 && next) {
      push({
        organizationId: org.id,
        kind: "winback",
        windowKey: `quiet-${bucket}`,
        recipient,
        template: "lifecycle-winback",
        data: {
          businessName,
          daysAway: quietDays,
          leadCount: orgLeads.filter((l) => l.status === "new").length,
          nextAction: next.action,
          nextActionWhy: next.why,
          actionUrl: `https://revoragrowthsystems.com${next.to}`,
        },
      });
    }
  }

  return planned;
}

/** Sends every due lifecycle email and records the outcome. */
export async function runLifecycleEmails(db: Db, options: { limit?: number; max?: number } = {}) {
  const planned = await planLifecycleEmails(db, options.limit ?? 40);
  const queue = planned.slice(0, options.max ?? 25);
  const result: LifecycleResult = {
    scanned: planned.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const send of queue) {
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
        templateData: send.data,
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
