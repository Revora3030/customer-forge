/**
 * B12-6 /analyze: a bounded, polite look at ONE public competitor page (plus at
 * most one linked service page on the same host) next to the owner's own site.
 *
 * Rules: every fetch goes through net-guard's guardedFetch (no redirects
 * followed automatically, public addresses only), robots.txt is honoured per
 * path via the shared robots-parser helper, a noindex page is not analysed,
 * pages are size- and time-capped, social platforms are refused, and every
 * table cell is either "observed" (with URL + fetch time) or "not measured".
 * Fetched page text is DATA: it is clipped, stripped of markup and control
 * characters and never interpreted as instructions. No scores, no rankings,
 * no judgement words about the competitor.
 */
import { guardedFetch } from "@/lib/net-guard.server";
import { parseRobots, REVORA_USER_AGENT } from "@/lib/robots";

export const MAX_PAGE_BYTES = 512 * 1024;
export const MAX_ROBOTS_BYTES = 64 * 1024;
export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_PAGES = 2;

const SOCIAL_HOSTS = [
  "facebook.com", "fb.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "linkedin.com",
  "youtube.com", "youtu.be", "pinterest.com", "threads.net", "snapchat.com", "reddit.com", "nextdoor.com",
  "yelp.com", "google.com", "maps.app.goo.gl", "g.page",
];

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type AuditDeps = { fetch?: FetchLike; now?: () => Date };

export type PageFacts = {
  url: string;
  fetchedAt: string;
  status: number;
  responseMs: number;
  viewportMeta: boolean;
  title: string;
  headings: { level: 1 | 2 | 3; text: string }[];
  services: string[];
  contactRoutes: { phoneLinks: number; emailLinks: number; forms: number; contactPage: string | null };
  schemaTypes: string[];
  truncated: boolean;
};

export type SiteAudit =
  | { ok: true; pages: PageFacts[]; robotsPresent: boolean; notes: string[] }
  | { ok: false; url: string; fetchedAt: string; reason: string };

export function isSocialHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

/** Plain, clipped, single-line text. Never markup, never control characters. */
export function cleanText(raw: string, max = 120): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    // eslint-disable-next-line no-control-regex -- stripping control/bidi characters from untrusted page text is the point
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: "", truncated: false };
  const dec = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      text += dec.decode(value.slice(0, value.byteLength - (bytes - maxBytes)));
      await reader.cancel();
      return { text, truncated: true };
    }
    text += dec.decode(value, { stream: true });
  }
  return { text: text + dec.decode(), truncated: false };
}

function schemaTypesFrom(html: string): { types: string[]; services: string[] } {
  const types = new Set<string>();
  const services = new Set<string>();
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.slice(0, 50).forEach((n) => visit(n, depth + 1)); return; }
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    const typeList = Array.isArray(t) ? t : t === undefined ? [] : [t];
    for (const x of typeList) if (typeof x === "string") types.add(cleanText(x, 60));
    if (typeList.includes("Service") && typeof obj["name"] === "string") services.add(cleanText(obj["name"], 80));
    for (const v of Object.values(obj)) visit(v, depth + 1);
  };
  for (const m of blocks) {
    try { visit(JSON.parse(m[1] ?? ""), 0); } catch { /* invalid JSON-LD is just skipped */ }
  }
  return { types: [...types].filter(Boolean).slice(0, 20), services: [...services].filter(Boolean).slice(0, 20) };
}

export function hasNoindex(html: string, headers: Headers): boolean {
  if (/noindex/i.test(headers.get("x-robots-tag") ?? "")) return true;
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (/name=["']?(robots|googlebot)["']?/i.test(tag) && /content=["'][^"']*noindex/i.test(tag)) return true;
  }
  return false;
}

/** Pure extraction from already-fetched HTML. Exported for tests. */
export function extractFacts(html: string, pageUrl: string) {
  const body = html.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ");
  const headings: PageFacts["headings"] = [];
  for (const m of body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = cleanText(m[2] ?? "");
    if (text) headings.push({ level: Number(m[1]) as 1 | 2 | 3, text });
    if (headings.length >= 30) break;
  }
  const schema = schemaTypesFrom(html);
  const links = [...body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 500);
  let contactPage: string | null = null;
  let host = "";
  try { host = new URL(pageUrl).host; } catch { /* keep empty */ }
  const sameHost = (href: string) => {
    try { const u = new URL(href, pageUrl); return u.host === host && /^https?:$/.test(u.protocol) ? u : null; } catch { return null; }
  };
  for (const [, href = "", label = ""] of links) {
    if (contactPage) break;
    const u = sameHost(href);
    if (u && (/contact/i.test(u.pathname) || /^\s*contact/i.test(cleanText(label)))) contactPage = u.toString();
  }
  const serviceLink = links
    .map(([, href = ""]) => sameHost(href))
    .find((u) => u !== null && /\/(services?|what-we-do)(\/|$)/i.test(u.pathname) && u.toString() !== pageUrl);
  return {
    viewportMeta: /<meta\b[^>]*name=["']?viewport["']?/i.test(html),
    title: cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 160),
    headings,
    services: schema.services,
    schemaTypes: schema.types,
    contactRoutes: {
      phoneLinks: links.filter(([, h = ""]) => /^tel:/i.test(h.trim())).length,
      emailLinks: links.filter(([, h = ""]) => /^mailto:/i.test(h.trim())).length,
      forms: (body.match(/<form\b/gi) ?? []).length,
      contactPage,
    },
    serviceLink: serviceLink ? serviceLink.toString() : null,
  };
}

/** Audit one site: robots.txt, the given page, and at most one same-host service page. */
export async function auditSite(rawUrl: string, deps: AuditDeps = {}): Promise<SiteAudit> {
  const doFetch: FetchLike = deps.fetch ?? ((u, init) => guardedFetch(u, init));
  const now = deps.now ?? (() => new Date());
  const stamp = () => now().toISOString();
  let start: URL;
  try {
    start = new URL(rawUrl.trim());
    if (start.protocol !== "https:" && start.protocol !== "http:") throw new Error();
  } catch {
    return { ok: false, url: rawUrl, fetchedAt: stamp(), reason: "That isn't a public web address." };
  }
  start.hash = "";
  if (isSocialHost(start.hostname))
    return { ok: false, url: start.toString(), fetchedAt: stamp(), reason: "Social media and review platforms aren't analysed. Paste the business's own website." };

  const headers = { "user-agent": `${REVORA_USER_AGENT}/1.0 (+https://revoragrowthsystems.com)`, accept: "text/html,text/plain" };
  const robotsUrl = new URL("/robots.txt", start).toString();
  let robotsText: string | null = null;
  try {
    const r = await doFetch(robotsUrl, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (r.status >= 200 && r.status < 300) robotsText = (await readCapped(r, MAX_ROBOTS_BYTES)).text;
    else await r.body?.cancel();
  } catch {
    robotsText = null; // unreachable robots.txt: treated as absent
  }
  const robots = parseRobots(robotsUrl, robotsText);

  const pages: PageFacts[] = [];
  const notes: string[] = [];
  const queue: string[] = [start.toString()];
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift() as string;
    const fetchedAt = stamp();
    if (!robots.isAllowed(url)) {
      if (pages.length === 0) return { ok: false, url, fetchedAt, reason: "This site's robots.txt asks crawlers not to fetch this page, so it wasn't analysed." };
      notes.push(`Skipped ${url}: disallowed by robots.txt.`);
      continue;
    }
    const t0 = Date.now();
    let res: Response;
    try {
      res = await doFetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      if (pages.length === 0) return { ok: false, url, fetchedAt, reason: "The page couldn't be reached within the time limit." };
      notes.push(`Skipped ${url}: not reachable.`);
      continue;
    }
    const responseMs = Date.now() - t0;
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const loc = res.headers.get("location");
      notes.push(`${url} redirected (HTTP ${res.status})${loc ? ` to ${cleanText(loc, 200)}` : ""}; redirects are not followed.`);
      if (pages.length === 0) return { ok: false, url, fetchedAt, reason: `The page redirects (HTTP ${res.status}). Paste the final address${loc ? `: ${cleanText(loc, 200)}` : ""}.` };
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      await res.body?.cancel();
      if (pages.length === 0) return { ok: false, url, fetchedAt, reason: `The address returned HTTP ${res.status} without a web page.` };
      continue;
    }
    const { text: html, truncated } = await readCapped(res, MAX_PAGE_BYTES);
    if (hasNoindex(html, res.headers)) {
      if (pages.length === 0) return { ok: false, url, fetchedAt, reason: "This page is marked noindex, so it wasn't analysed." };
      notes.push(`Skipped ${url}: marked noindex.`);
      continue;
    }
    const { serviceLink, ...facts } = extractFacts(html, url);
    pages.push({ url, fetchedAt, status: res.status, responseMs, truncated, ...facts });
    if (pages.length === 1 && serviceLink) queue.push(serviceLink);
  }
  if (pages.length === 0) return { ok: false, url: start.toString(), fetchedAt: stamp(), reason: "No page could be analysed." };
  return { ok: true, pages, robotsPresent: robots.present, notes };
}

/* ---- comparison table ---- */

export type Cell =
  | { kind: "observed"; value: string; url: string; fetchedAt: string }
  | { kind: "not_measured"; reason: string; url: string | null; fetchedAt: string | null };

export type ComparisonRow = { label: string; owner: Cell; competitor: Cell };

const ROWS: { label: string; read: (p: PageFacts, all: PageFacts[]) => string | null }[] = [
  { label: "HTTP status", read: (p) => String(p.status) },
  { label: "Our fetch time (one request, not a speed score)", read: (p) => `${p.responseMs} ms` },
  { label: "Mobile viewport tag", read: (p) => (p.viewportMeta ? "present" : "absent") },
  { label: "Page title", read: (p) => p.title || "none found" },
  { label: "Main heading (H1)", read: (p) => p.headings.find((h) => h.level === 1)?.text ?? "none found" },
  { label: "Section headings (H2)", read: (p) => String(p.headings.filter((h) => h.level === 2).length) },
  { label: "Services listed in schema", read: (_p, all) => { const s = [...new Set(all.flatMap((x) => x.services))]; return s.length ? s.slice(0, 8).join(", ") : "none in schema" } },
  { label: "Phone links (tel:)", read: (p) => String(p.contactRoutes.phoneLinks) },
  { label: "Email links (mailto:)", read: (p) => String(p.contactRoutes.emailLinks) },
  { label: "Forms on page", read: (p) => String(p.contactRoutes.forms) },
  { label: "Contact page link", read: (p) => p.contactRoutes.contactPage ?? "none found" },
  { label: "Schema types", read: (_p, all) => { const s = [...new Set(all.flatMap((x) => x.schemaTypes))]; return s.length ? s.join(", ") : "none found" } },
];

function cellsFor(audit: SiteAudit | null, read: (p: PageFacts, all: PageFacts[]) => string | null, missingReason: string): Cell {
  if (!audit) return { kind: "not_measured", reason: missingReason, url: null, fetchedAt: null };
  if (!audit.ok) return { kind: "not_measured", reason: audit.reason, url: audit.url, fetchedAt: audit.fetchedAt };
  const first = audit.pages[0] as PageFacts;
  const value = read(first, audit.pages);
  return value === null
    ? { kind: "not_measured", reason: "Not available from this page.", url: first.url, fetchedAt: first.fetchedAt }
    : { kind: "observed", value, url: first.url, fetchedAt: first.fetchedAt };
}

export function buildComparison(owner: SiteAudit | null, competitor: SiteAudit): ComparisonRow[] {
  const rows = ROWS.map(({ label, read }) => ({
    label,
    owner: cellsFor(owner, read, "Your site has no public address yet."),
    competitor: cellsFor(competitor, read, ""),
  }));
  // Lab speed needs PageSpeed Insights; no free key is configured, so say so instead of guessing.
  const na = (a: SiteAudit | null): Cell => ({
    kind: "not_measured",
    reason: "Lab speed score needs PageSpeed Insights, which isn't set up.",
    url: a ? (a.ok ? (a.pages[0] as PageFacts).url : a.url) : null,
    fetchedAt: null,
  });
  rows.push({ label: "Lab speed score", owner: na(owner), competitor: na(competitor) });
  return rows;
}

export type AnalyzeResult = { rows: ComparisonRow[]; competitor: SiteAudit; owner: SiteAudit | null; limits: string[] };

export const ANALYZE_LIMITS = [
  "One page plus at most one linked service page per site; robots.txt and noindex are respected.",
  "Only what the page itself shows. No social media, no traffic, ranking or revenue estimates.",
  "Fetch time is a single request from our server, not a speed score.",
  "Page text is shown as data only and is never followed as instructions.",
];

export async function analyzeCompetitor(competitorUrl: string, ownerUrl: string | null, deps: AuditDeps = {}): Promise<AnalyzeResult> {
  const [competitor, owner] = await Promise.all([
    auditSite(competitorUrl, deps),
    ownerUrl ? auditSite(ownerUrl, deps) : Promise.resolve(null),
  ]);
  return { rows: buildComparison(owner, competitor), competitor, owner, limits: ANALYZE_LIMITS };
}
