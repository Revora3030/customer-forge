/**
 * Outside evidence handed to the review panel. Every source is optional and
 * bounded: when a connector is missing, slow or out of quota the review simply
 * proceeds without it. Evidence only shapes which gaps reviewers flag — it is
 * always labelled and never becomes customer-facing copy by itself.
 */
export type ReviewEvidence = {
  /** Live web research on what buyers in this industry expect. */
  industry: string | null;
  /** Real Google search queries for the customer's verified domain. */
  search: string | null;
  /** The business's public Google listing, for consistency checks only. */
  listing: string | null;
  /** Semrush keyword demand for the industry/city (market estimates). */
  keywords?: string | null;
};

export const NO_EVIDENCE: ReviewEvidence = { industry: null, search: null, listing: null, keywords: null };

export type EvidenceInput = {
  industry?: string | null | undefined;
  siteUrl?: string | null | undefined;
  businessName?: string | null | undefined;
  city?: string | null | undefined;
};

type Deps = {
  searchWeb: typeof import("@/lib/integrations/research.server").searchWeb;
  keywordIdeas?: (phrase: string) => Promise<Array<{ phrase: string; volume: number }>>;
  google: Pick<typeof import("@/lib/integrations/google.server"), "resolveProperty" | "searchPerformance" | "localListings">;
};

async function loadDeps(): Promise<Deps> {
  const [research, google] = await Promise.all([
    import("@/lib/integrations/research.server"),
    import("@/lib/integrations/google.server"),
  ]);
  return { searchWeb: research.searchWeb, google, keywordIdeas: semrushKeywordIdeas };
}

/** Related keywords from Semrush via the connector gateway; empty when unlinked. */
async function semrushKeywordIdeas(phrase: string): Promise<Array<{ phrase: string; volume: number }>> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const semrushKey = process.env["SEMRUSH_API_KEY"];
  if (!lovableKey || !semrushKey) return [];
  const url = new URL("https://connector-gateway.lovable.dev/semrush/keywords/phrase_related");
  url.searchParams.set("phrase", phrase);
  url.searchParams.set("database", "us");
  url.searchParams.set("export_columns", "Ph,Nq");
  url.searchParams.set("display_limit", "12");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": semrushKey },
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok || text.includes("LIMIT EXCEEDED")) throw new Error(`semrush ${res.status}: ${text.slice(0, 200)}`);
  const body = JSON.parse(text) as { data?: { columnNames?: string[]; rows?: unknown[][] } };
  const cols = body.data?.columnNames ?? [];
  const pi = cols.indexOf("Ph"), vi = cols.indexOf("Nq");
  return (body.data?.rows ?? [])
    .map((r) => ({ phrase: String(r[pi >= 0 ? pi : 0] ?? ""), volume: Number(r[vi >= 0 ? vi : 1] ?? 0) }))
    .filter((k) => k.phrase);
}

async function keywordEvidence(deps: Deps, industry: string, city: string | null): Promise<string | null> {
  if (!deps.keywordIdeas) return null;
  const seed = [industry.trim().slice(0, 60), city].filter(Boolean).join(" ");
  const ideas = await deps.keywordIdeas(seed);
  if (!ideas.length) return null;
  return [
    `SEMRUSH KEYWORD DEMAND (US estimates for "${seed}"). Use to judge whether headings, titles and service names match how buyers search; never print these numbers on the site:`,
    ...ideas.slice(0, 12).map((k) => `- "${k.phrase}" — ~${k.volume} searches/month`),
  ].join("\n");
}

async function industryEvidence(deps: Deps, industry: string): Promise<string | null> {
  const topic = industry.trim().slice(0, 80);
  const found = await deps.searchWeb(
    `what customers expect from a ${topic} business website before contacting or booking: information, layout and trust signals`,
    5,
  );
  if (!found.ok || !found.results.length) return null;
  return [
    "LIVE WEB RESEARCH (third-party material, never quote as this business's own facts):",
    ...found.results.map((r) => `- ${r.title} — ${r.snippet} (${r.url})`),
  ].join("\n");
}

async function searchEvidence(deps: Deps, siteUrl: string): Promise<string | null> {
  const resolution = await deps.google.resolveProperty(siteUrl);
  if (resolution.status !== "selected") return null;
  const perf = await deps.google.searchPerformance(resolution.siteUrl);
  const byQuery = new Map<string, { impressions: number; clicks: number; position: number }>();
  for (const row of perf.rows) {
    if (!row.query) continue;
    const prev = byQuery.get(row.query) ?? { impressions: 0, clicks: 0, position: row.position };
    byQuery.set(row.query, {
      impressions: prev.impressions + row.impressions,
      clicks: prev.clicks + row.clicks,
      position: Math.min(prev.position, row.position),
    });
  }
  const top = [...byQuery.entries()].sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 15);
  if (!top.length) return null;
  return [
    `GOOGLE SEARCH CONSOLE (real queries, ${perf.period.start} to ${perf.period.end}). Use to judge headings and titles; never state these numbers on the site:`,
    ...top.map(([q, v]) => `- "${q}" — ${v.impressions} impressions, ${v.clicks} clicks, best position ${v.position.toFixed(1)}`),
  ].join("\n");
}

async function listingEvidence(deps: Deps, name: string, city: string | null): Promise<string | null> {
  const listings = await deps.google.localListings([name, city].filter(Boolean).join(" "));
  const match = listings.find((l) => l.name.toLowerCase().includes(name.toLowerCase().slice(0, 40)));
  if (!match) return null;
  return [
    "PUBLIC GOOGLE LISTING (may belong to a different business with a similar name). Only flag contradictions between the site and this listing for the owner to confirm; never copy it onto the site:",
    `- ${match.name}${match.address ? ` — ${match.address}` : ""}${match.phone ? ` — ${match.phone}` : ""}${match.website ? ` — ${match.website}` : ""}`,
  ].join("\n");
}

function settle(p: Promise<string | null>, label: string): Promise<string | null> {
  return p.catch((error: unknown) => {
    console.warn(`review evidence skipped: ${label}`, (error as Error)?.message);
    return null;
  });
}

export async function gatherReviewEvidence(input: EvidenceInput, deps?: Deps): Promise<ReviewEvidence> {
  const d = deps ?? (await loadDeps());
  const industry = input.industry?.trim();
  const siteUrl = input.siteUrl?.trim();
  const name = input.businessName?.trim();
  const city = input.city?.trim() || null;
  const [a, b, c, k] = await Promise.all([
    industry ? settle(industryEvidence(d, industry), "industry") : Promise.resolve(null),
    siteUrl ? settle(searchEvidence(d, siteUrl), "search") : Promise.resolve(null),
    name && name.length >= 3 ? settle(listingEvidence(d, name, city), "listing") : Promise.resolve(null),
    industry ? settle(keywordEvidence(d, industry, city), "keywords") : Promise.resolve(null),
  ]);
  return { industry: a, search: b, listing: c, keywords: k };
}

/**
 * Which evidence each reviewer sees. Every reviewer whose judgement a source
 * can sharpen gets it; purely mechanical checks (accessibility, mobile) get none.
 */
const EVIDENCE_ACCESS: Record<keyof ReviewEvidence, readonly string[]> = {
  industry: ["industry_fit", "conversion", "funnel", "deep_conversion", "senior", "whole_site"],
  search: ["seo", "completeness", "senior", "whole_site"],
  keywords: ["seo", "industry_fit", "completeness", "whole_site"],
  listing: ["consistency", "truthfulness", "funnel"],
};

export function evidenceFor(area: string, evidence: ReviewEvidence): string[] {
  const order: Array<keyof ReviewEvidence> = ["industry", "search", "keywords", "listing"];
  return order.flatMap((key) => {
    const value = evidence[key];
    return value && EVIDENCE_ACCESS[key].includes(area) ? [value] : [];
  });
}

/** Everything gathered, for the lead designer revising from panel notes. */
export function allEvidence(evidence: ReviewEvidence): string | null {
  const parts = [evidence.industry, evidence.search, evidence.keywords, evidence.listing].filter(
    (v): v is string => Boolean(v),
  );
  return parts.length ? parts.join("\n\n") : null;
}
