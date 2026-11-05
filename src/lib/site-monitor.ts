/**
 * LOV-3 owner live-site monitor: the pure part. Turns probe results into
 * plain-English findings, diffs them against what is already open, and decides
 * whether the owner gets an email (new problems only, at most one per site per
 * 24 hours). No I/O here, so it is fully unit-tested.
 */
import type { VisitorErrorGroup } from "@/lib/visitor-errors";

export type MonitorCheck = "home_down" | "https_cert" | "sitemap_missing" | "noindex_live" | "visitor_errors";

export type ProbeResult = {
  homeStatus: number | null;
  homeError: string | null;
  /** Days until the TLS certificate expires; null when it couldn't be read. */
  certDaysLeft: number | null;
  certError: string | null;
  sitemapStatus: number | null;
  noindex: boolean;
};

/** A spike from the LOV-4 visitor-side error feed (`visitorErrorSpikes`). */
export type VisitorErrorSpike = Pick<VisitorErrorGroup, "message" | "today">;

export type Finding = { check: MonitorCheck; title: string; detail: string };

export const CERT_WARN_DAYS = 14;
export const EMAIL_GAP_MS = 24 * 60 * 60 * 1000;

export function findingsFor(host: string, probe: ProbeResult, spikes: readonly VisitorErrorSpike[] = []): Finding[] {
  const out: Finding[] = [];
  if (probe.homeError || probe.homeStatus === null || probe.homeStatus >= 400) {
    out.push({
      check: "home_down",
      title: "Your website isn't loading",
      detail: `${host} didn't load when we checked (${probe.homeError ?? `HTTP ${probe.homeStatus}`}). Visitors may see an error page.`,
    });
  }
  if (probe.certError) {
    out.push({ check: "https_cert", title: "Your secure connection (HTTPS) has a problem", detail: `Browsers may warn visitors that ${host} isn't secure.` });
  } else if (probe.certDaysLeft !== null && probe.certDaysLeft < CERT_WARN_DAYS) {
    const days = Math.max(0, Math.floor(probe.certDaysLeft));
    out.push({ check: "https_cert", title: "Your security certificate expires soon", detail: `The HTTPS certificate for ${host} expires in ${days} day${days === 1 ? "" : "s"}.` });
  }
  if (!probe.homeError && probe.sitemapStatus !== null && probe.sitemapStatus >= 400) {
    out.push({ check: "sitemap_missing", title: "Search engines can't find your sitemap", detail: `${host}/sitemap.xml returned an error, so Google may miss some of your pages.` });
  }
  if (probe.noindex) {
    out.push({ check: "noindex_live", title: "Your live site is hidden from Google", detail: `${host} tells search engines not to list it ("noindex"), so it won't show in search results.` });
  }
  if (spikes.length) {
    const total = spikes.reduce((sum, s) => sum + s.today, 0);
    const top = spikes[0]?.message.slice(0, 120) ?? "";
    out.push({ check: "visitor_errors", title: "Visitors are hitting errors on your site", detail: `${total} errors from real visitors today${top ? `, most often: "${top}"` : ""}.` });
  }
  return out;
}

export type OpenFinding = { check: MonitorCheck; state: "new" | "seen" };

/** Which findings are new, which are still open, and which got fixed. */
export function diffFindings(open: readonly OpenFinding[], current: readonly Finding[]) {
  const openChecks = new Set(open.map((f) => f.check));
  const currentChecks = new Set(current.map((f) => f.check));
  return {
    fresh: current.filter((f) => !openChecks.has(f.check)),
    still: current.filter((f) => openChecks.has(f.check)),
    fixed: open.filter((f) => !currentChecks.has(f.check)).map((f) => f.check),
  };
}

/** Email only for new problems, and never twice within 24 hours for one site. */
export function shouldEmail(fresh: readonly Finding[], lastEmailAt: number | null, now: number): boolean {
  if (!fresh.length) return false;
  return lastEmailAt === null || now - lastEmailAt >= EMAIL_GAP_MS;
}

/** Detects a noindex directive in a robots meta tag or the X-Robots-Tag header. */
export function hasNoindex(html: string, robotsHeader: string | null): boolean {
  if (robotsHeader && /noindex/i.test(robotsHeader)) return true;
  const metas = html.slice(0, 200_000).match(/<meta\b[^>]*>/gi) ?? [];
  return metas.some((tag) => /name\s*=\s*["']?(robots|googlebot)["']?/i.test(tag) && /content\s*=\s*["'][^"']*noindex/i.test(tag));
}

export type MonitorMode = "off" | "dry_run" | "on";

/** Ships OFF. `SITE_MONITOR_MODE=dry_run` lists what would be sent; `on` sends. */
export function monitorMode(env: Record<string, string | undefined> = process.env): MonitorMode {
  const raw = (env["SITE_MONITOR_MODE"] ?? "").trim().toLowerCase();
  return raw === "on" || raw === "dry_run" ? raw : "off";
}

export function alertEmail(host: string, fresh: readonly Finding[], fixLink: (f: Finding) => string) {
  return {
    heading: fresh.length === 1 ? fresh[0]!.title : `${fresh.length} new problems on ${host}`,
    message: [
      `Our check of ${host} found ${fresh.length === 1 ? "a new problem" : "new problems"}:`,
      fresh.map((f) => `• ${f.title}. ${f.detail}\n  Fix it: ${fixLink(f)}`).join("\n\n"),
      "We'll only email again if something new comes up, and never more than once a day.",
    ].join("\n\n"),
  };
}
