/**
 * B12-9: the extra, owner-facing lines of the Monday weekly report.
 *
 * Pure helpers (no database, no model). Every line comes from rows the workspace
 * really has; when a number cannot be stated honestly the line is left out or says
 * "not tracked yet". Nothing is estimated, and a suggestion is only ever described,
 * never applied: the owner approves it inside Revora.
 */
import { usd } from "@/lib/monthly-value";

export type DigestLead = { source: string | null; created_at: string };
export type DigestQuote = { id: string; created_at: string };
export type DigestQuoteLine = { quote_id: string; quantity: number | string | null; unit_price: number | string | null };
export type DigestView = { session_id: string | null; created_at: string };
export type DigestSuggestion = { title: string; body: string };
export type DigestAuditRow = { reachable: boolean; p1_count: number | null; p2_count: number | null; findings: unknown; audited_at: string };
/** B13-7: the latest saved site-content audit for this workspace's site (site_content_audits). */
export type DigestSeo = { auditedAt: string; reachable: boolean; missingTitles: number; brokenLinks: number; p1: number; p2: number };

export type WeeklyDigestExtra = {
  /** New leads in the 7 days before this week (for the comparison). null = could not be read. */
  previousLeads: number | null;
  /** Lead sources recorded on this week's leads, most common first. */
  topSources: { source: string; count: number }[];
  quotes: { created: number; acceptedThisWeek: number; value: number | null } | null;
  views: { thisWeek: number; visitors: number; previous: number } | null;
  suggestion: DigestSuggestion | null;
  /** Latest saved audit of the site, or null/undefined when none has been saved lately. */
  seo?: DigestSeo | null;
};

const DAY = 86_400_000;
const MAX_SOURCES = 3;

const num = (value: number | string | null | undefined) => {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const clean = (value: string | null | undefined, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Sources recorded on this week's leads. Blank sources are not counted: we do not guess where a lead came from. */
export function topLeadSources(leads: readonly Pick<DigestLead, "source">[]): { source: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const source = clean(lead.source, 40);
    if (!source) continue;
    const key = source.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SOURCES)
    .map(([source, count]) => ({ source, count }));
}

/** Total of the quote lines for these quotes, or null when none of them has a priced line. */
export function quoteValue(quotes: readonly DigestQuote[], lines: readonly DigestQuoteLine[]): number | null {
  const ids = new Set(quotes.map((q) => q.id));
  let total = 0;
  let priced = false;
  for (const line of lines) {
    if (!ids.has(line.quote_id)) continue;
    const amount = num(line.quantity) * num(line.unit_price);
    if (amount > 0) {
      total += amount;
      priced = true;
    }
  }
  return priced ? Math.round(total * 100) / 100 : null;
}

/** Splits page views into this week and the week before, and counts distinct visitors this week. */
export function weekViews(views: readonly DigestView[], now: number): { thisWeek: number; visitors: number; previous: number } {
  const start = now - 7 * DAY;
  const previousStart = now - 14 * DAY;
  const mine = views.filter((v) => Date.parse(v.created_at) >= start);
  const previous = views.filter((v) => {
    const at = Date.parse(v.created_at);
    return at >= previousStart && at < start;
  }).length;
  const visitors = new Set(mine.map((v) => v.session_id).filter(Boolean)).size;
  return { thisWeek: mine.length, visitors, previous };
}

/** Reduces one saved audit row to the few counts the owner sees. Unknown shapes count as zero, never guessed. */
export function seoFromAudit(row: DigestAuditRow | null | undefined): DigestSeo | null {
  if (!row) return null;
  const findings = Array.isArray(row.findings) ? (row.findings as { check?: unknown }[]) : [];
  const count = (check: string) => findings.filter((f) => f && f.check === check).length;
  return {
    auditedAt: row.audited_at,
    reachable: row.reachable === true,
    missingTitles: count("title"),
    brokenLinks: count("broken-link"),
    p1: num(row.p1_count),
    p2: num(row.p2_count),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "up 2 from last week" — only when last week had data to compare with. */
export function weekTrend(current: number, previous: number | null): string | null {
  if (previous === null || previous <= 0) return null;
  const diff = current - previous;
  if (diff === 0) return "the same as last week";
  return `${diff > 0 ? "up" : "down"} ${Math.abs(diff)} from last week`;
}

/** B13-7: the site's SEO health from the last saved audit. Says "not tracked yet" for anything the audit does not measure. */
export function seoSection(seo: DigestSeo | null | undefined): string {
  const lines = ["Your site's search health:"];
  if (!seo) {
    lines.push("• Site check: not tracked yet (no recent audit of your site)");
  } else if (!seo.reachable) {
    lines.push("• Site check: your site did not load when we last checked. Please open it and let us know if it looks wrong.");
  } else {
    lines.push(`• Pages checked on ${seo.auditedAt.slice(0, 10)}: ${seo.p1 + seo.p2 ? `${plural(seo.p1 + seo.p2, "issue")} found` : "no issues found"}`);
    lines.push(`• Missing page titles: ${seo.missingTitles}`);
    lines.push(`• Broken links: ${seo.brokenLinks}`);
  }
  lines.push("• Sitemap, indexed pages and page speed: not tracked yet");
  return lines.join("\n");
}

/** The extra section of the Monday email. Empty string when there is nothing real to add. */
export function weeklyDigestSection(extra: WeeklyDigestExtra | null | undefined, leadsThisWeek: number): string {
  if (!extra) return "";
  const blocks: string[] = [];
  const trend = weekTrend(leadsThisWeek, extra.previousLeads);
  if (trend) blocks.push(`New leads this week were ${trend}.`);

  if (extra.topSources.length) {
    blocks.push(`Where this week's leads said they came from: ${extra.topSources.map((s) => `${s.source} (${s.count})`).join(", ")}.`);
  }

  const details: string[] = [];
  if (extra.quotes && (extra.quotes.created || extra.quotes.acceptedThisWeek)) {
    const value = extra.quotes.value !== null ? `, ${usd(extra.quotes.value)} in total` : "";
    details.push(`• Quotes made: ${extra.quotes.created}${value}`);
    details.push(`• Quotes accepted: ${extra.quotes.acceptedThisWeek}`);
  }
  if (extra.views) {
    const viewTrend = weekTrend(extra.views.thisWeek, extra.views.previous);
    details.push(
      extra.views.thisWeek
        ? `• Website visits: ${extra.views.thisWeek} from ${plural(extra.views.visitors, "visitor")}${viewTrend ? ` (${viewTrend})` : ""}`
        : "• Website visits: none recorded this week",
    );
  }
  details.push("• Form completion rate: not tracked yet");
  blocks.push(["Also this week:", details.join("\n")].join("\n"));
  blocks.push(seoSection(extra.seo));

  if (extra.suggestion) {
    const title = clean(extra.suggestion.title, 120);
    const body = clean(extra.suggestion.body, 300);
    if (title) {
      blocks.push(
        [
          `One thing worth doing: ${title}${body ? `. ${body}` : ""}`,
          "Nothing happens until you approve it. Review it in Revora: https://revoragrowthsystems.com/app",
        ].join("\n"),
      );
    }
  }
  return blocks.join("\n\n");
}
