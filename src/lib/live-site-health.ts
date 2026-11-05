/**
 * COMP-4 post-publish health, built only on the LOV-3 site-monitor checks
 * (site down, HTTPS/cert, sitemap, noindex, visitor error spikes). Nothing is
 * estimated: a check that was not measured is "not_verified", never a pass.
 * The only number shown is a plain count of passed checks.
 */
import type { MonitorCheck, ProbeResult, VisitorErrorSpike } from "@/lib/site-monitor";
import { CERT_WARN_DAYS } from "@/lib/site-monitor";

export type CheckStatus = "pass" | "fail" | "not_verified";
export type CheckOutcome = { check: MonitorCheck; status: CheckStatus };

export const HEALTH_CHECKS: readonly { check: MonitorCheck; label: string; means: string }[] = [
  { check: "home_down", label: "Site loads", means: "Your home page answered without an error." },
  { check: "https_cert", label: "Secure connection (HTTPS)", means: `The security certificate is valid for at least ${CERT_WARN_DAYS} more days, so browsers won't warn visitors.` },
  { check: "sitemap_missing", label: "Sitemap reachable", means: "Search engines can download /sitemap.xml to find all your pages." },
  { check: "noindex_live", label: "Visible to Google", means: "The site doesn't tell search engines to hide it (no \"noindex\")." },
  { check: "visitor_errors", label: "No error spikes", means: "Real visitors aren't hitting a spike of page errors today." },
];

/** What one monitor run actually measured, check by check. */
export function checkOutcomes(probe: ProbeResult, spikes: readonly VisitorErrorSpike[] | null): CheckOutcome[] {
  const homeDown = Boolean(probe.homeError) || probe.homeStatus === null || probe.homeStatus >= 400;
  const cert: CheckStatus = probe.certError
    ? "fail"
    : probe.certDaysLeft === null
      ? "not_verified"
      : probe.certDaysLeft < CERT_WARN_DAYS
        ? "fail"
        : "pass";
  const sitemap: CheckStatus = probe.homeError || probe.sitemapStatus === null ? "not_verified" : probe.sitemapStatus >= 400 ? "fail" : "pass";
  // A page we couldn't load can't prove it is indexable.
  const noindex: CheckStatus = probe.noindex ? "fail" : homeDown ? "not_verified" : "pass";
  const errors: CheckStatus = spikes === null ? "not_verified" : spikes.length ? "fail" : "pass";
  return [
    { check: "home_down", status: homeDown ? "fail" : "pass" },
    { check: "https_cert", status: cert },
    { check: "sitemap_missing", status: sitemap },
    { check: "noindex_live", status: noindex },
    { check: "visitor_errors", status: errors },
  ];
}

export type StoredCheck = { check: string; status: string; checkedAt: string };
export type HealthRow = { check: MonitorCheck; label: string; means: string; status: CheckStatus; checkedAt: string | null };
export type HealthSummary = {
  rating: "healthy" | "needs_work" | "not_checked";
  passed: number;
  total: number;
  rows: HealthRow[];
  lastCheckedAt: string | null;
};

/** Stale results older than this are shown as not verified. */
export const HEALTH_STALE_MS = 8 * 24 * 60 * 60 * 1000;

export function healthSummary(stored: readonly StoredCheck[], now: number = Date.now()): HealthSummary {
  const byCheck = new Map(stored.map((s) => [s.check, s]));
  const rows: HealthRow[] = HEALTH_CHECKS.map(({ check, label, means }) => {
    const s = byCheck.get(check);
    const fresh = s && Number.isFinite(Date.parse(s.checkedAt)) && now - Date.parse(s.checkedAt) <= HEALTH_STALE_MS;
    const status: CheckStatus = fresh && (s.status === "pass" || s.status === "fail") ? s.status : "not_verified";
    return { check, label, means, status, checkedAt: status === "not_verified" ? null : s!.checkedAt };
  });
  const passed = rows.filter((r) => r.status === "pass").length;
  const failed = rows.some((r) => r.status === "fail");
  const times = rows.map((r) => r.checkedAt).filter((t): t is string => Boolean(t)).sort();
  return {
    rating: failed ? "needs_work" : passed === rows.length ? "healthy" : "not_checked",
    passed,
    total: rows.length,
    rows,
    lastCheckedAt: times.at(-1) ?? null,
  };
}
