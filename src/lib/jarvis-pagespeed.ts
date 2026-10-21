/**
 * Free Lighthouse audit via Google's PageSpeed Insights API. Optional
 * GOOGLE_PAGESPEED_API_KEY raises quota. The target URL must already have been
 * allow-listed by jarvis-target-url.
 */
export const PAGESPEED_TARGET = "https://revoragrowthsystems.com/";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

export type PageSpeedStrategy = "mobile" | "desktop";

export type PageSpeedSummary = {
  url: string;
  strategy: PageSpeedStrategy;
  scores: Record<(typeof CATEGORIES)[number], number | null>;
  metrics: Record<string, string | null>;
  topOpportunities: string[];
};

export function normalizeStrategy(value: unknown): PageSpeedStrategy {
  return value === "desktop" ? "desktop" : "mobile";
}

export function buildPageSpeedUrl(apiKey?: string, target: string = PAGESPEED_TARGET, strategy: PageSpeedStrategy = "mobile"): string {
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", target);
  u.searchParams.set("strategy", strategy);
  for (const c of CATEGORIES) u.searchParams.append("category", c.toUpperCase().replace("-", "_"));
  if (apiKey) u.searchParams.set("key", apiKey);
  return u.toString();
}

type Raw = { lighthouseResult?: { categories?: Record<string, { score?: number | null }>; audits?: Record<string, { title?: string; displayValue?: string; score?: number | null; details?: { type?: string } }> } };

export function summarizePageSpeed(raw: unknown, target: string = PAGESPEED_TARGET, strategy: PageSpeedStrategy = "mobile"): PageSpeedSummary | null {
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
  return { url: target, strategy, scores, metrics, topOpportunities };
}
