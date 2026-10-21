/**
 * Free Lighthouse audit via Google's PageSpeed Insights API (no key needed;
 * optional GOOGLE_PAGESPEED_API_KEY raises quota). Fixed Revora URL only, so
 * the model cannot point it at arbitrary hosts.
 */
export const PAGESPEED_TARGET = "https://revoragrowthsystems.com/";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

export type PageSpeedSummary = {
  url: string;
  strategy: "mobile";
  scores: Record<(typeof CATEGORIES)[number], number | null>;
  metrics: Record<string, string | null>;
  topOpportunities: string[];
};

export function buildPageSpeedUrl(apiKey?: string): string {
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", PAGESPEED_TARGET);
  u.searchParams.set("strategy", "mobile");
  for (const c of CATEGORIES) u.searchParams.append("category", c.toUpperCase().replace("-", "_"));
  if (apiKey) u.searchParams.set("key", apiKey);
  return u.toString();
}

type Raw = { lighthouseResult?: { categories?: Record<string, { score?: number | null }>; audits?: Record<string, { title?: string; displayValue?: string; score?: number | null; details?: { type?: string } }> } };

export function summarizePageSpeed(raw: unknown): PageSpeedSummary | null {
  const lr = (raw as Raw)?.lighthouseResult;
  if (!lr?.categories) return null;
  const scores = Object.fromEntries(CATEGORIES.map((c) => {
    const s = lr.categories?.[c]?.score;
    return [c, typeof s === "number" ? Math.round(s * 100) : null];
  })) as PageSpeedSummary["scores"];
  const audits = lr.audits ?? {};
  const metricIds = ["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time", "first-contentful-paint", "speed-index"];
  const metrics = Object.fromEntries(metricIds.map((id) => [id, audits[id]?.displayValue ?? null]));
  const topOpportunities = Object.values(audits)
    .filter((a) => a.details?.type === "opportunity" && typeof a.score === "number" && a.score < 0.9 && a.title)
    .slice(0, 5)
    .map((a) => `${a.title}${a.displayValue ? ` (${a.displayValue})` : ""}`.slice(0, 160));
  return { url: PAGESPEED_TARGET, strategy: "mobile", scores, metrics, topOpportunities };
}
