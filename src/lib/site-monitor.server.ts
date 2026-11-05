/**
 * LOV-3 owner live-site monitor: the scheduled part. For each published,
 * verified custom domain whose workspace is not cancelled or suspended it
 * checks the home page, HTTPS certificate, sitemap, noindex and the LOV-4
 * visitor error feed (`visitor_error_events`), stores findings, and emails the
 * owner only about NEW problems, at most once per site per 24 hours.
 *
 * Ships OFF (`SITE_MONITOR_MODE` unset). `dry_run` probes and lists what would
 * be stored and sent without writing or sending; `on` does both. Every
 * dependency is injectable so tests never hit the network or send email.
 */
import { checkOutcomes } from "@/lib/live-site-health";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connect } from "node:tls";
import { alertRecipient } from "@/lib/lead-alert-recipient";
import { cleanDomain, sendOnce, PLATFORM_APP_ORIGIN, type ReportRun } from "@/lib/owner-reports.server";
import {
  alertEmail,
  diffFindings,
  findingsFor,
  hasNoindex,
  monitorMode,
  shouldEmail,
  type Finding,
  type MonitorCheck,
  type MonitorMode,
  type OpenFinding,
  type ProbeResult,
} from "@/lib/site-monitor";
import { visitorErrorSpikes, type VisitorErrorRow } from "@/lib/visitor-errors";

type Db = Pick<SupabaseClient, "from">;

export type SendAlert = (input: { organizationId: string; host: string; recipient: string; heading: string; message: string; windowKey: string }) => Promise<boolean>;

export type SiteMonitorDeps = {
  mode?: MonitorMode;
  now?: number;
  probe?: (host: string) => Promise<ProbeResult>;
  /** Link to the fix card for a finding. LOV-5's shared card is not merged yet; this opens the finding list on the Domain page. */
  fixLink?: (finding: Finding, organizationId: string) => string;
  send?: SendAlert;
};

export type SiteMonitorRun = ReportRun & {
  mode: MonitorMode;
  findings: Array<{ host: string; check: MonitorCheck; fresh: boolean }>;
  wouldEmail: Array<{ host: string; recipient: string; heading: string }>;
};

export const defaultFixLink = (finding: Finding) => `${PLATFORM_APP_ORIGIN}/app/domain?finding=${finding.check}#site-monitor`;

/* --------------------------------- probes --------------------------------- */

function certDaysLeft(host: string, timeoutMs = 10_000): Promise<{ days: number | null; error: string | null }> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: timeoutMs });
    const done = (value: { days: number | null; error: string | null }) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!socket.authorized) return done({ days: null, error: String(socket.authorizationError ?? "untrusted") });
      const end = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
      done({ days: Number.isFinite(end) ? (end - Date.now()) / 86_400_000 : null, error: null });
    });
    socket.once("timeout", () => done({ days: null, error: null }));
    socket.once("error", (error) => done({ days: null, error: error.message.slice(0, 120) }));
  });
}

export async function probeSite(host: string, fetcher: typeof fetch = fetch): Promise<ProbeResult> {
  const get = (path: string) =>
    fetcher(`https://${host}${path}`, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "RevoraSiteMonitor/1.0" } });
  let homeStatus: number | null = null;
  let homeError: string | null = null;
  let noindex = false;
  try {
    const home = await get("/");
    homeStatus = home.status;
    if (home.status >= 400) homeError = `HTTP ${home.status}`;
    else noindex = hasNoindex(await home.text(), home.headers.get("x-robots-tag"));
  } catch (error) {
    homeError = (error as Error)?.name === "TimeoutError" ? "timed out after 15s" : "no response";
  }
  let sitemapStatus: number | null = null;
  if (!homeError) {
    try {
      sitemapStatus = (await get("/sitemap.xml")).status;
    } catch {
      sitemapStatus = null;
    }
  }
  const cert = await certDaysLeft(host);
  return { homeStatus, homeError, certDaysLeft: cert.days, certError: cert.error, sitemapStatus, noindex };
}

/* ---------------------------------- run ----------------------------------- */

export async function runSiteMonitor(db: Db, deps: SiteMonitorDeps = {}): Promise<SiteMonitorRun> {
  const mode = deps.mode ?? monitorMode();
  const now = deps.now ?? Date.now();
  const run: SiteMonitorRun = { job: "site-monitor", scanned: 0, sent: 0, skipped: 0, failed: 0, details: [], mode, findings: [], wouldEmail: [] };
  if (mode === "off") return run;
  const probe = deps.probe ?? ((host: string) => probeSite(host));
  const fixLink = deps.fixLink ?? defaultFixLink;
  const send: SendAlert =
    deps.send ??
    (async (input) => {
      const before = run.sent;
      await sendOnce(db, run, { organizationId: input.organizationId, kind: "site_monitor_alert", windowKey: input.windowKey, recipient: input.recipient, heading: input.heading, message: input.message, businessName: input.host });
      return run.sent > before;
    });

  const { data: sites, error } = await db
    .from("website_settings")
    .select("organization_id, custom_domain")
    .eq("published", true)
    .eq("publish_state", "published")
    .eq("domain_verified", true)
    .limit(1000);
  if (error) throw new Error(`website_settings: ${error.message}`);
  const orgIds = [...new Set((sites ?? []).map((s) => s.organization_id as string))];
  if (!orgIds.length) return run;
  const { data: orgs } = await db.from("organizations").select("id, subscription_status").in("id", orgIds);
  // Respect ownership/billing: never probe a cancelled or suspended workspace.
  const live = new Set((orgs ?? []).filter((o) => o.subscription_status !== "canceled" && o.subscription_status !== "suspended").map((o) => o.id as string));

  const today = new Date(now).toISOString().slice(0, 10);
  const since = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const seenHosts = new Set<string>();

  for (const site of sites ?? []) {
    const organizationId = site.organization_id as string;
    const host = cleanDomain(site.custom_domain);
    if (!host || seenHosts.has(host) || !live.has(organizationId)) continue;
    seenHosts.add(host);
    run.scanned += 1;
    try {
      const [result, errorRows, openRows] = await Promise.all([
        probe(host),
        db.from("visitor_error_events").select("day, kind, message_hash, message, page_path, occurrences, last_seen").eq("organization_id", organizationId).gte("day", since).limit(2000),
        db.from("site_monitor_findings").select("check_key, state, emailed_at").eq("organization_id", organizationId).eq("host", host),
      ]);
      const spikes = visitorErrorSpikes(((errorRows.data ?? []) as VisitorErrorRow[]), today);
      const errorsMeasured = !errorRows.error;
      const current = findingsFor(host, result, spikes);
      const rows = (openRows.data ?? []) as Array<{ check_key: MonitorCheck; state: string; emailed_at: string | null }>;
      const open: OpenFinding[] = rows.filter((r) => r.state !== "fixed").map((r) => ({ check: r.check_key, state: r.state as OpenFinding["state"] }));
      const { fresh, still, fixed } = diffFindings(open, current);
      const lastEmail = rows.reduce<number | null>((max, r) => (r.emailed_at ? Math.max(max ?? 0, Date.parse(r.emailed_at)) : max), null);
      for (const f of current) run.findings.push({ host, check: f.check, fresh: fresh.includes(f) });

      const stamp = new Date(now).toISOString();
      // COMP-4: remember what this run measured (pass / fail / not verified) per
      // check, in dry_run and on (off returned above). Check results only:
      // findings rows and owner emails stay strictly behind "on".
      await db.from("site_monitor_checks").upsert(
        checkOutcomes(result, errorsMeasured ? spikes : null).map((o) => ({ organization_id: organizationId, host, check_key: o.check, status: o.status, checked_at: stamp })),
        { onConflict: "organization_id,host,check_key" },
      );
      if (mode === "on") {
        for (const f of fresh)
          await db.from("site_monitor_findings").upsert(
            { organization_id: organizationId, host, check_key: f.check, state: "new", title: f.title, detail: f.detail, first_seen_at: stamp, last_seen_at: stamp, fixed_at: null },
            { onConflict: "organization_id,host,check_key" },
          );
        for (const f of still)
          await db.from("site_monitor_findings").update({ last_seen_at: stamp, title: f.title, detail: f.detail }).eq("organization_id", organizationId).eq("host", host).eq("check_key", f.check);
        if (fixed.length)
          await db.from("site_monitor_findings").update({ state: "fixed", fixed_at: stamp }).eq("organization_id", organizationId).eq("host", host).in("check_key", fixed);
      }

      if (!shouldEmail(fresh, lastEmail, now)) {
        if (fresh.length) run.details.push({ organizationId, status: "skipped", reason: "emailed_within_24h" });
        continue;
      }
      const { data: profile } = await db.from("business_profiles").select("notification_email, email, owner_email, notify_on_lead").eq("organization_id", organizationId).maybeSingle();
      const recipient = profile ? alertRecipient(profile as never) : null;
      if (!recipient) {
        run.skipped += 1;
        run.details.push({ organizationId, status: "skipped", reason: "no_alert_recipient" });
        continue;
      }
      const email = alertEmail(host, fresh, (f) => fixLink(f, organizationId));
      if (mode === "dry_run") {
        run.wouldEmail.push({ host, recipient, heading: email.heading });
        continue;
      }
      const sent = await send({ organizationId, host, recipient, ...email, windowKey: `site-monitor:${host}:${stamp.slice(0, 16)}` });
      if (sent)
        await db.from("site_monitor_findings").update({ emailed_at: stamp }).eq("organization_id", organizationId).eq("host", host).in("check_key", fresh.map((f) => f.check));
    } catch (error) {
      run.failed += 1;
      run.details.push({ organizationId, status: "failed", reason: (error as Error)?.message?.slice(0, 120) ?? "error" });
    }
  }
  return run;
}
