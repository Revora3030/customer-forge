import { useQuery } from "@tanstack/react-query";
import { getSiteHealth } from "@/lib/live-site-health.functions";
import type { CheckStatus, HealthSummary } from "@/lib/live-site-health";

const RATING: Record<HealthSummary["rating"], string> = {
  healthy: "Healthy",
  needs_work: "Needs work",
  not_checked: "Not fully checked yet",
};
const STATUS: Record<CheckStatus, string> = { pass: "Passed", fail: "Problem", not_verified: "Not verified" };

/**
 * COMP-4 post-publish health card. Shows only checks the live-site monitor
 * actually measured; anything unmeasured reads "Not verified", never passed.
 * The number is a plain count of passed checks, not a score.
 */
export function SiteHealthCard({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ["site-health", organizationId],
    queryFn: () => getSiteHealth({ data: { organizationId } }),
    staleTime: 5 * 60_000,
  });
  const health = query.data?.health;
  if (!health) return null;
  return (
    <section className="panel mt-3 p-4" aria-label="Live site health">
      <p className="eyebrow">Live site health</p>
      <p className="mt-1 text-[13px] font-medium" data-rating={health.rating}>
        {RATING[health.rating]}: {health.passed} of {health.total} checks passed
      </p>
      {health.lastCheckedAt && (
        <p className="text-[11px] text-muted-foreground">
          {query.data?.host} last checked {new Date(health.lastCheckedAt).toLocaleString()}. We re-check automatically.
        </p>
      )}
      <ul className="mt-2 space-y-1.5">
        {health.rows.map((row) => (
          <li key={row.check} className="text-[12px]" data-status={row.status}>
            <span className="font-medium">{row.label}</span>: {STATUS[row.status]}
            <p className="text-muted-foreground">{row.status === "not_verified" ? "We haven't been able to measure this yet, so we don't count it as passed." : row.means}</p>
          </li>
        ))}
      </ul>
      {health.rating === "needs_work" && <p className="mt-2 text-[11px] text-muted-foreground">See the problems listed below for how to fix them.</p>}
    </section>
  );
}
