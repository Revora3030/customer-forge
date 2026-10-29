/**
 * Weekly content audit of published customer sites. Reads each site's served
 * home page and a few of its internal links, and reports problems to the
 * platform inbox only; no customer is emailed. Bounded per run and rotated by
 * week so every published site is covered over time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditHtml, type AuditFinding } from "@/lib/site-content-audit";
import { PLATFORM_APP_ORIGIN, cleanDomain, sendSiteAuditDigest } from "@/lib/owner-reports.server";

type Db = Pick<SupabaseClient, "from">;

export const MAX_SITES_PER_RUN = 40;
export const MAX_LINKS_PER_SITE = 6;

export type SiteAudit = { label: string; url: string; reachable: boolean; findings: AuditFinding[]; organizationId?: string };
export type SiteAuditRun = { job: "site-content-audit"; runId?: string; scanned: number; withProblems: number; sent: number; skipped: number; failed: number; saved?: number; audits: SiteAudit[]; details: { organizationId?: string; status: string; reason?: string }[] };

/** Keep a year of history; older rows are pruned on each run. */
export const AUDIT_RETENTION_DAYS = 365;

/** One site_content_audits row per audited site. Best-effort: a failed save never stops the digest. */
export async function saveAuditRun(db: Db, runId: string, audits: readonly SiteAudit[], now = Date.now()): Promise<number> {
  const rows = audits
    .filter((audit) => audit.organizationId && /^https:\/\//.test(audit.url))
    .map((audit) => ({
      run_id: runId,
      organization_id: audit.organizationId!,
      label: audit.label.slice(0, 255),
      url: audit.url.slice(0, 500),
      reachable: audit.reachable,
      p1_count: audit.findings.filter((f) => f.severity === "P1").length,
      p2_count: audit.findings.filter((f) => f.severity === "P2").length,
      findings: audit.findings.slice(0, 50).map((f) => ({ check: f.check, severity: f.severity, detail: f.detail.slice(0, 300) })),
      audited_at: new Date(now).toISOString(),
    }));
  if (!rows.length) return 0;
  try {
    const { error } = await db.from("site_content_audits").insert(rows);
    if (error) return 0;
  } catch {
    return 0;
  }
  try {
    await db.from("site_content_audits").delete().lt("audited_at", new Date(now - AUDIT_RETENTION_DAYS * 86_400_000).toISOString());
  } catch {
    // pruning is housekeeping; the run's rows are already saved
  }
  return rows.length;
}

/** Same sites every call in the same week, a different slice each week. */
export function pickSitesForWeek<T>(all: readonly T[], now: number, size = MAX_SITES_PER_RUN): T[] {
  if (all.length <= size) return [...all];
  const week = Math.floor(now / (7 * 86_400_000));
  const start = (week * size) % all.length;
  return Array.from({ length: size }, (_, i) => all[(start + i) % all.length]!);
}

async function get(url: string, fetcher: typeof fetch): Promise<{ status: number; body: string } | null> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "RevoraContentAudit/1.0" } });
    return { status: response.status, body: response.ok ? await response.text() : "" };
  } catch {
    return null;
  }
}

export async function auditSite(label: string, url: string, fetcher: typeof fetch): Promise<SiteAudit> {
  const home = await get(url, fetcher);
  if (!home || home.status >= 400) return { label, url, reachable: false, findings: [{ check: "title", severity: "P1", detail: home ? `home page answered HTTP ${home.status}` : "home page did not respond" }] };
  const { findings, internalLinks } = auditHtml(home.body, url);
  for (const link of internalLinks.slice(0, MAX_LINKS_PER_SITE)) {
    const page = await get(link, fetcher);
    if (!page || page.status >= 400) findings.push({ check: "broken-link", severity: "P1", detail: `${new URL(link).pathname} ${page ? `answered HTTP ${page.status}` : "did not respond"}` });
  }
  return { label, url, reachable: true, findings };
}

export async function runSiteContentAudit(db: Db, fetcher: typeof fetch = fetch, now = Date.now()): Promise<SiteAuditRun> {
  const run: SiteAuditRun = { job: "site-content-audit", scanned: 0, withProblems: 0, sent: 0, skipped: 0, failed: 0, audits: [], details: [] };
  const { data: settings, error } = await db
    .from("website_settings")
    .select("organization_id, custom_domain, domain_verified")
    .eq("published", true)
    .order("organization_id", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`website_settings: ${error.message}`);
  const ids = (settings ?? []).map((row) => row.organization_id as string);
  const { data: orgs } = ids.length ? await db.from("organizations").select("id, slug, is_suspended").in("id", ids) : { data: [] };
  const slugs = new Map((orgs ?? []).filter((o) => o.is_suspended !== true).map((o) => [o.id as string, String(o.slug)]));

  const sites: { label: string; url: string; organizationId: string }[] = [];
  for (const row of settings ?? []) {
    const slug = slugs.get(row.organization_id as string);
    if (!slug) continue;
    const host = row.domain_verified ? cleanDomain(row.custom_domain) : null;
    const organizationId = row.organization_id as string;
    sites.push(host ? { label: host, url: `https://${host}`, organizationId } : { label: slug, url: `${PLATFORM_APP_ORIGIN}/s/${slug}`, organizationId });
  }

  for (const site of pickSitesForWeek(sites, now)) run.audits.push({ ...(await auditSite(site.label, site.url, fetcher)), organizationId: site.organizationId });
  run.scanned = run.audits.length;
  run.runId = crypto.randomUUID();
  run.saved = await saveAuditRun(db, run.runId, run.audits, now);
  const problems = run.audits.filter((audit) => audit.findings.some((f) => f.severity === "P1"));
  run.withProblems = problems.length;
  if (problems.length) await sendSiteAuditDigest(db, run, problems, now);
  return run;
}
