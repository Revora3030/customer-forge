import type { SupabaseClient } from "@supabase/supabase-js";
import { EmailAPIError } from "@lovable.dev/email-js";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { alertRecipient } from "@/lib/lead-alert-recipient";
import { sendLeadAlert } from "@/lib/messaging.server";
import { REVORA } from "@/lib/brand";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";

/**
 * Owner reports and monitors that run inside the app, called on a schedule
 * by GitHub Actions (.github/workflows/scheduled-jobs.yml). They replace the
 * n8n workflows of the same purpose; nothing here needs n8n.
 *
 *   lead-reminder   — daily: leads still "new" 24h+ after arriving, per workspace
 *   weekly-report   — weekly: last 7 days of leads and appointments, per workspace
 *   site-health     — hourly: every published custom domain plus the main site
 *   lead-alert-retry — hourly: re-sends new-lead alerts that failed for a transient reason
 *
 * Each workspace's report goes to that workspace's own alert inbox (the same
 * one new-lead alerts use). Every send claims a row in lifecycle_email_log
 * first — its unique (organization, kind, window) key makes a retried or
 * overlapping run unable to send the same report twice. Numbers come straight
 * from the database; nothing is estimated.
 */

type Db = Pick<SupabaseClient, "from">;

export type ReportRun = {
  job: string;
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  details: { organizationId?: string; status: string; reason?: string }[];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ISO week key such as "2026-W41", used so one weekly report per week is possible. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

type Workspace = { id: string; name: string; recipient: string };

async function activeWorkspaces(db: Db): Promise<Workspace[]> {
  const { data: orgs, error } = await db
    .from("organizations")
    .select("id, name")
    .eq("is_demo", false)
    .eq("is_suspended", false)
    .limit(1000);
  if (error) throw new Error(`organizations: ${error.message}`);
  const ids = (orgs ?? []).map((o) => o.id as string);
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await db
    .from("business_profiles")
    .select("organization_id, notification_email, email, owner_email, notify_on_lead")
    .in("organization_id", ids);
  if (profileError) throw new Error(`business_profiles: ${profileError.message}`);
  const byOrg = new Map((profiles ?? []).map((p) => [p.organization_id as string, p]));
  return (orgs ?? [])
    .map((o) => {
      const profile = byOrg.get(o.id as string);
      const recipient = profile ? alertRecipient(profile as never) : null;
      return recipient ? { id: o.id as string, name: String(o.name ?? ""), recipient } : null;
    })
    .filter((w): w is Workspace => w !== null);
}

/** Claims the (org, kind, window) slot, sends, and records the outcome. */
async function sendOnce(
  db: Db,
  run: ReportRun,
  input: { organizationId: string; kind: string; windowKey: string; recipient: string; heading: string; message: string; businessName: string },
): Promise<void> {
  const { error: claimError } = await db.from("lifecycle_email_log").insert({
    organization_id: input.organizationId,
    kind: input.kind,
    window_key: input.windowKey,
    recipient: input.recipient,
    status: "sending",
  });
  if (claimError) {
    run.skipped += 1;
    run.details.push({ organizationId: input.organizationId, status: "already_sent" });
    return;
  }
  const finish = (status: string, detail?: string) =>
    db
      .from("lifecycle_email_log")
      .update({ status, detail: detail ?? null })
      .eq("organization_id", input.organizationId)
      .eq("kind", input.kind)
      .eq("window_key", input.windowKey);
  try {
    const outcome = await sendTemplateEmail("automation-message", input.recipient, {
      idempotencyKey: `${input.kind}-${input.organizationId}-${input.windowKey}`,
      templateData: { businessName: input.businessName, heading: input.heading, message: input.message, signoff: "— Revora" },
    });
    if (outcome.sent) {
      run.sent += 1;
      await finish("sent");
      run.details.push({ organizationId: input.organizationId, status: "sent" });
    } else {
      run.skipped += 1;
      await finish("skipped", outcome.reason);
      run.details.push({ organizationId: input.organizationId, status: "skipped", reason: outcome.reason });
    }
  } catch (error) {
    const reason = error instanceof EmailAPIError ? (error.code ?? `email_${error.status}`) : "email_transport_error";
    run.failed += 1;
    // Release the slot so the next scheduled run retries this report.
    await db
      .from("lifecycle_email_log")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("kind", input.kind)
      .eq("window_key", input.windowKey);
    run.details.push({ organizationId: input.organizationId, status: "failed", reason });
  }
}

/* ------------------------------ lead reminder ----------------------------- */

export type StaleLead = { organization_id: string; name: string; phone: string | null; email: string | null; service_interest: string | null; created_at: string };

/** Plain-text reminder body. Exported for tests. */
export function leadReminderMessage(leads: StaleLead[], now: number): string {
  const lines = leads.map((lead) => {
    const hours = Math.max(24, Math.round((now - new Date(lead.created_at).getTime()) / HOUR));
    const reach = [lead.phone, lead.email].filter(Boolean).join(" · ") || "no contact details";
    return `• ${lead.name} — ${reach}${lead.service_interest ? ` — ${lead.service_interest}` : ""} (waiting ${hours}h)`;
  });
  return [
    `${leads.length} lead${leads.length === 1 ? " is" : "s are"} still marked new more than 24 hours after arriving:`,
    lines.join("\n"),
    "Reply today, then change each lead's status in Revora → Leads so it drops off this list.",
    "https://revoragrowthsystems.com/app/leads",
  ].join("\n\n");
}

export async function runLeadReminders(db: Db, now = Date.now()): Promise<ReportRun> {
  const run: ReportRun = { job: "lead-reminder", scanned: 0, sent: 0, skipped: 0, failed: 0, details: [] };
  const workspaces = await activeWorkspaces(db);
  if (!workspaces.length) return run;
  const { data, error } = await db
    .from("leads")
    .select("organization_id, name, phone, email, service_interest, created_at")
    .eq("status", "new")
    .lt("created_at", new Date(now - DAY).toISOString())
    .gt("created_at", new Date(now - 14 * DAY).toISOString())
    .in("organization_id", workspaces.map((w) => w.id))
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`leads: ${error.message}`);
  const leads = (data ?? []) as StaleLead[];
  const windowKey = new Date(now).toISOString().slice(0, 10);
  for (const workspace of workspaces) {
    const mine = leads.filter((lead) => lead.organization_id === workspace.id);
    run.scanned += 1;
    if (!mine.length) continue;
    await sendOnce(db, run, {
      organizationId: workspace.id,
      kind: "lead_reminder",
      windowKey,
      recipient: workspace.recipient,
      businessName: workspace.name,
      heading: `${mine.length} lead${mine.length === 1 ? "" : "s"} still waiting for a reply`,
      message: leadReminderMessage(mine.slice(0, 50), now),
    });
  }
  return run;
}

/* ------------------------------ weekly report ----------------------------- */

export type WeekCounts = { leads: number; uncontacted: number; won: number; appointments: number };

export function weeklyReportMessage(name: string, counts: WeekCounts): string {
  if (!counts.leads && !counts.appointments) {
    return `No new leads or appointments came in for ${name} during the last 7 days.\n\nNumbers come straight from Revora — nothing is estimated.`;
  }
  return [
    `Here is ${name}'s last 7 days:`,
    [
      `• New leads: ${counts.leads}`,
      `• Still marked new (not contacted yet): ${counts.uncontacted}`,
      `• Booked or completed: ${counts.won}`,
      `• Appointments made: ${counts.appointments}`,
    ].join("\n"),
    "Numbers come straight from Revora — nothing is estimated.",
    "https://revoragrowthsystems.com/app",
  ].join("\n\n");
}

export async function runWeeklyReports(db: Db, now = Date.now()): Promise<ReportRun> {
  const run: ReportRun = { job: "weekly-report", scanned: 0, sent: 0, skipped: 0, failed: 0, details: [] };
  const workspaces = await activeWorkspaces(db);
  if (!workspaces.length) return run;
  const since = new Date(now - 7 * DAY).toISOString();
  const ids = workspaces.map((w) => w.id);
  const [leads, appointments] = await Promise.all([
    db.from("leads").select("organization_id, status").gte("created_at", since).in("organization_id", ids).limit(10000),
    db.from("appointments").select("organization_id").gte("created_at", since).in("organization_id", ids).limit(10000),
  ]);
  if (leads.error) throw new Error(`leads: ${leads.error.message}`);
  if (appointments.error) throw new Error(`appointments: ${appointments.error.message}`);
  const windowKey = isoWeekKey(new Date(now));
  for (const workspace of workspaces) {
    run.scanned += 1;
    const mine = (leads.data ?? []).filter((l) => l.organization_id === workspace.id);
    const counts: WeekCounts = {
      leads: mine.length,
      uncontacted: mine.filter((l) => l.status === "new").length,
      won: mine.filter((l) => l.status === "booked" || l.status === "completed").length,
      appointments: (appointments.data ?? []).filter((a) => a.organization_id === workspace.id).length,
    };
    await sendOnce(db, run, {
      organizationId: workspace.id,
      kind: "weekly_report",
      windowKey,
      recipient: workspace.recipient,
      businessName: workspace.name,
      heading: `Weekly report: ${counts.leads} lead${counts.leads === 1 ? "" : "s"}, ${counts.appointments} appointment${counts.appointments === 1 ? "" : "s"}`,
      message: weeklyReportMessage(workspace.name, counts),
    });
  }
  return run;
}

/* ---------------------------- lead alert retry ---------------------------- */

/**
 * Failure reasons worth sending again: provider blips, rate limits and
 * sender-side states that clear on their own. A suppressed inbox is NOT here;
 * re-sending to an address that refuses mail can't help, so the Integration
 * Center asks the owner for a different one instead.
 */
export const RETRYABLE_ALERT_REASONS = new Set([
  "email_transport_error",
  "rate_limited",
  "429",
  "emails_disabled",
  "domain_not_verified",
]);

/** A lead is retried only while it has at most this many logged attempts. */
export const MAX_ALERT_ATTEMPTS = 3;

export type AlertLogRow = {
  organization_id: string;
  lead_id: string | null;
  kind: string;
  status: string;
  reason: string | null;
  created_at: string;
};

export type AlertRetryCandidate = { organizationId: string; leadId: string; kind: string };

/**
 * Picks the leads whose newest alert failed for a retryable reason in the last
 * 24h, that never had an accepted alert and have at most MAX_ALERT_ATTEMPTS
 * attempts. Rows are grouped per (organization, lead), so one workspace's log
 * can never decide another's retry. Exported for tests.
 */
export function pickLeadAlertRetries(rows: AlertLogRow[], now = Date.now()): AlertRetryCandidate[] {
  const groups = new Map<string, AlertLogRow[]>();
  for (const row of rows) {
    if (!row.lead_id || !row.organization_id || row.kind === "test") continue;
    const key = `${row.organization_id}|${row.lead_id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const since = now - DAY;
  const picked: AlertRetryCandidate[] = [];
  for (const list of groups.values()) {
    if (list.some((row) => row.status === "sent")) continue;
    if (list.length > MAX_ALERT_ATTEMPTS) continue;
    const newest = [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!newest || newest.status !== "failed") continue;
    if (!RETRYABLE_ALERT_REASONS.has(newest.reason ?? "")) continue;
    if (!(Date.parse(newest.created_at) >= since)) continue;
    picked.push({ organizationId: newest.organization_id, leadId: newest.lead_id!, kind: newest.kind });
  }
  return picked;
}

const ALERT_TITLES: Record<string, string> = {
  inquiry: "New lead",
  contact: "New message",
  quote: "Quote request",
  booking: "New booking request",
  consultation: "Consultation request",
};

type RetryLead = {
  id: string;
  organization_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  service_interest: string | null;
  message: string | null;
  estimated_value: number | null;
};

/**
 * Re-sends lead alerts that failed for a transient reason. Each lead is
 * reloaded by id AND its log row's organization, the recipient is recomputed
 * from that workspace's own profile, and the resend reuses the original
 * `lead-alert-<id>` key so the provider can never deliver it twice. Every
 * outcome is logged; nothing is marked sent unless the provider accepted it.
 */
export async function runLeadAlertRetries(db: Db, now = Date.now()): Promise<ReportRun> {
  const run: ReportRun = { job: "lead-alert-retry", scanned: 0, sent: 0, skipped: 0, failed: 0, details: [] };
  // Look back a little further than 24h so older attempts still count toward
  // the per-lead limit and an earlier success still blocks a resend.
  const { data, error } = await db
    .from("lead_alert_log")
    .select("organization_id, lead_id, kind, status, reason, created_at")
    .gte("created_at", new Date(now - 2 * DAY).toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`lead_alert_log: ${error.message}`);
  const candidates = pickLeadAlertRetries((data ?? []) as AlertLogRow[], now);

  for (const candidate of candidates) {
    run.scanned += 1;
    const skip = (reason: string) => {
      run.skipped += 1;
      run.details.push({ organizationId: candidate.organizationId, status: "skipped", reason });
    };

    const { data: org } = await db
      .from("organizations")
      .select("id, name, is_suspended")
      .eq("id", candidate.organizationId)
      .maybeSingle();
    if (!org?.id || org.is_suspended === true) {
      skip("workspace_unavailable");
      continue;
    }

    const { data: leadRow } = await db
      .from("leads")
      .select("id, organization_id, name, email, phone, city, service_interest, message, estimated_value")
      .eq("id", candidate.leadId)
      .eq("organization_id", candidate.organizationId)
      .maybeSingle();
    const lead = (leadRow ?? null) as RetryLead | null;
    if (!lead || lead.id !== candidate.leadId || lead.organization_id !== candidate.organizationId) {
      skip("lead_missing");
      continue;
    }

    const { data: profile } = await db
      .from("business_profiles")
      .select("notification_email, email, owner_email, notify_on_lead")
      .eq("organization_id", candidate.organizationId)
      .maybeSingle();
    const recipient = profile ? alertRecipient(profile as never) : null;
    if (!recipient) {
      skip("no_alert_recipient");
      continue;
    }

    const result = await sendLeadAlert(
      recipient,
      {
        businessName: String(org.name ?? "") || "Your business",
        kind: ALERT_TITLES[candidate.kind] ?? "New lead",
        leadName: lead.name ?? "someone",
        leadEmail: lead.email || undefined,
        leadPhone: lead.phone || undefined,
        city: lead.city || undefined,
        service: lead.service_interest || undefined,
        estimate: lead.estimated_value ? `$${lead.estimated_value}` : undefined,
        message: lead.message || undefined,
      },
      // The SAME key as the first attempt: provider-side dedupe means a retry
      // can never become a second alert for one lead.
      `lead-alert-${lead.id}`,
    );

    const { error: logError } = await db.from("lead_alert_log").insert({
      organization_id: candidate.organizationId,
      lead_id: lead.id,
      recipient,
      kind: candidate.kind,
      status: result.ok ? "sent" : "failed",
      reason: result.ok ? null : result.reason,
    });
    if (logError) console.error("[lead-alert-retry] log failed", logError.message);

    if (result.ok) {
      run.sent += 1;
      run.details.push({ organizationId: candidate.organizationId, status: "sent" });
    } else {
      run.failed += 1;
      run.details.push({ organizationId: candidate.organizationId, status: "failed", reason: result.reason });
    }
  }
  return run;
}

/* ------------------------------- site health ------------------------------ */

export type SiteCheck = { url: string; label: string; organizationId: string | null; status: number | null; error: string | null };

/** Normalizes a stored custom domain to a bare hostname, or null when unusable. */
export function cleanDomain(raw: unknown): string | null {
  const host = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "");
  return /^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

async function probe(url: string, fetcher: typeof fetch): Promise<{ status: number | null; error: string | null }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "RevoraHealthCheck/1.0" } });
      if (response.status < 500) return { status: response.status, error: response.status >= 400 ? `HTTP ${response.status}` : null };
      if (attempt === 1) return { status: response.status, error: `HTTP ${response.status}` };
    } catch (error) {
      if (attempt === 1) return { status: null, error: (error as Error)?.name === "TimeoutError" ? "timed out after 15s" : "no response" };
    }
  }
  return { status: null, error: "no response" };
}

export async function runSiteHealth(db: Db, fetcher: typeof fetch = fetch, now = Date.now()): Promise<ReportRun & { down: SiteCheck[] }> {
  const run = { job: "site-health", scanned: 0, sent: 0, skipped: 0, failed: 0, details: [] as ReportRun["details"], down: [] as SiteCheck[] };
  const { data, error } = await db
    .from("website_settings")
    .select("organization_id, custom_domain")
    .eq("published", true)
    .eq("domain_verified", true)
    .limit(1000);
  if (error) throw new Error(`website_settings: ${error.message}`);
  const sites: { url: string; label: string; organizationId: string | null }[] = [{ url: "https://revoragrowthsystems.com", label: "Revora main site", organizationId: null }];
  const seen = new Set(["revoragrowthsystems.com"]);
  for (const row of data ?? []) {
    const host = cleanDomain(row.custom_domain);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    sites.push({ url: `https://${host}`, label: host, organizationId: row.organization_id as string });
  }
  const results: SiteCheck[] = [];
  for (let i = 0; i < sites.length; i += 8) {
    const batch = await Promise.all(sites.slice(i, i + 8).map(async (site) => ({ ...site, ...(await probe(site.url, fetcher)) })));
    results.push(...batch);
  }
  run.scanned = results.length;
  run.down = results.filter((r) => r.error);
  if (!run.down.length) return run;
  // One alert per hour to the platform inbox; repeats hourly while anything is down.
  const windowKey = new Date(now).toISOString().slice(0, 13);
  const { data: platform } = await db.from("organizations").select("id").eq("id", PLATFORM_OWNER_ORG_ID).maybeSingle();
  if (!platform?.id) {
    run.details.push({ status: "skipped", reason: "platform_workspace_missing" });
    return run;
  }
  await sendOnce(db, run, {
    organizationId: platform.id as string,
    kind: "site_health_alert",
    windowKey,
    recipient: REVORA.email,
    businessName: "Revora",
    heading: `${run.down.length} site${run.down.length === 1 ? "" : "s"} not loading`,
    message: [
      `These sites did not load on the hourly check (${new Date(now).toISOString()}):`,
      run.down.map((d) => `• ${d.label} (${d.url}): ${d.error}`).join("\n"),
      "This email repeats every hour until they load again.",
    ].join("\n\n"),
  });
  return run;
}
