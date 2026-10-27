/**
 * Keyless, read-only Jarvis checks backed by free public services.
 * Summaries keep only small, non-sensitive fields.
 */
import pkg from "../../package.json";

export const FREE_CHECK_TOOLS = [
  "website.html.validate",
  "security.dependencies.osv",
  "website.security.observatory",
  "domain.rdap.lookup",
  "domain.wayback.history",
  "website.text.extract",
  "website.seo.crawl",
  "domain.certificates.lookup",
  "places.osm.search",
] as const;
export type FreeCheckTool = (typeof FREE_CHECK_TOOLS)[number];
export const isFreeCheckTool = (id: string): id is FreeCheckTool => (FREE_CHECK_TOOLS as readonly string[]).includes(id);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : null);

export const W3C_URL = (target: string) => `https://validator.w3.org/nu/?out=json&doc=${encodeURIComponent(target)}`;
export function summarizeW3c(raw: unknown) {
  const messages = arr(obj(raw)["messages"]).map(obj);
  const errors = messages.filter((m) => m["type"] === "error");
  const warnings = messages.filter((m) => m["subType"] === "warning");
  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    topErrors: errors.slice(0, 10).map((m) => ({ line: m["lastLine"] ?? null, message: str(m["message"])?.slice(0, 200) ?? null })),
  };
}

/** Exact pinned versions only; ranges like ^1.2.3 are reduced to 1.2.3. */
export function dependencyList(deps: Record<string, string> = { ...(pkg as { dependencies?: Record<string, string> }).dependencies }) {
  return Object.entries(deps)
    .map(([name, v]) => ({ name, version: (v.match(/\d+\.\d+\.\d+[^\s]*/) ?? [])[0] ?? null }))
    .filter((d): d is { name: string; version: string } => Boolean(d.version))
    .slice(0, 300);
}
export const OSV_URL = "https://api.osv.dev/v1/querybatch";
export function osvBody(deps: { name: string; version: string }[]) {
  return { queries: deps.map((d) => ({ package: { name: d.name, ecosystem: "npm" }, version: d.version })) };
}
export function summarizeOsv(raw: unknown, deps: { name: string; version: string }[]) {
  const results = arr(obj(raw)["results"]);
  const affected = results
    .map((r, i) => ({ dep: deps[i], ids: arr(obj(r)["vulns"]).map((v) => str(obj(v)["id"])).filter(Boolean) as string[] }))
    .filter((r) => r.dep && r.ids.length);
  return {
    checkedPackages: deps.length,
    vulnerablePackages: affected.map((a) => ({ name: a.dep!.name, version: a.dep!.version, advisories: a.ids.slice(0, 5) })),
    note: "Direct dependencies only, using declared versions; installed versions may differ.",
  };
}

export const OBSERVATORY_URL = (host: string) => `https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${encodeURIComponent(host)}`;
export function summarizeObservatory(raw: unknown) {
  const b = obj(raw);
  if (!str(b["grade"])) return null;
  return { grade: str(b["grade"]), score: b["score"] ?? null, testsPassed: b["tests_passed"] ?? null, testsFailed: b["tests_failed"] ?? null, detailsUrl: str(b["details_url"]) };
}

export const RDAP_URL = (domain: string) => `https://rdap.org/domain/${encodeURIComponent(domain)}`;
export function summarizeRdap(raw: unknown) {
  const b = obj(raw);
  const events = arr(b["events"]).map(obj);
  const ev = (a: string) => str(events.find((e) => e["eventAction"] === a)?.["eventDate"]);
  const registrar = arr(b["entities"]).map(obj).find((e) => arr(e["roles"]).includes("registrar"));
  const vcard = arr(arr(obj(registrar)["vcardArray"])[1]).map(arr).find((f) => f[0] === "fn");
  return {
    domain: str(b["ldhName"])?.toLowerCase() ?? null,
    registrar: str(vcard?.[3]),
    registered: ev("registration"),
    expires: ev("expiration"),
    lastChanged: ev("last changed"),
    status: arr(b["status"]).filter((s) => typeof s === "string").slice(0, 8),
  };
}

export const WAYBACK_URL = (domain: string) => `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}&timestamp=19960101`;
export const WAYBACK_LATEST_URL = (domain: string) => `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`;
const tsToIso = (ts: string | null) => (ts && /^\d{14}$/.test(ts) ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : null);
export function summarizeWayback(first: unknown, latest: unknown) {
  const snap = (raw: unknown) => obj(obj(obj(raw)["archived_snapshots"])["closest"]);
  const f = snap(first), l = snap(latest);
  return {
    archived: Boolean(f["available"] || l["available"]),
    earliestSnapshot: tsToIso(str(f["timestamp"])),
    latestSnapshot: tsToIso(str(l["timestamp"])),
  };
}

/** Readability-style main text: drops scripts/nav/footer, prefers <main>/<article>. */
export function extractReadableText(html: string, maxChars = 6000) {
  let body = html.replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ");
  const main = body.match(/<(main|article)[\s>][\s\S]*?<\/\1>/i);
  if (main) body = main[0];
  body = body.replace(/<(nav|footer|header|aside|form)[\s>][\s\S]*?<\/\1>/gi, " ");
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 200);
  const text = body
    .replace(/<\/(p|h[1-6]|li|div|section|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text: text.slice(0, maxChars), truncated: text.length > maxChars, wordCount: text.split(/\s+/).filter(Boolean).length };
}

/* ---- SEO crawl, certificate and map lookups (keyless) ---- */

/** Bounded text read: no redirects, capped bytes. */
export async function readBoundedText(url: string, maxBytes: number, headers: Record<string, string> = {}, timeoutMs = 12000) {
  const res = await fetch(url, { redirect: "manual", credentials: "omit", headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) { await res.body?.cancel(); return { ok: false as const, status: res.status }; }
  const reader = res.body?.getReader();
  if (!reader) return { ok: true as const, status: res.status, text: "", truncated: false };
  const dec = new TextDecoder(); let text = ""; let bytes = 0; let truncated = false;
  while (true) {
    const p = await reader.read();
    if (p.done) break;
    if (bytes + p.value.byteLength > maxBytes) { truncated = true; await reader.cancel(); break; }
    bytes += p.value.byteLength; text += dec.decode(p.value, { stream: true });
  }
  return { ok: true as const, status: res.status, text, truncated };
}

export function summarizeRobots(text: string | null) {
  if (text === null) return { present: false, blocksAllCrawlers: false, sitemaps: [] as string[] };
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  let star = false; let blocksAll = false;
  for (const l of lines) {
    const [k, ...rest] = l.split(":"); const key = k!.trim().toLowerCase(); const v = rest.join(":").trim();
    if (key === "user-agent") star = v === "*";
    else if (star && key === "disallow" && v === "/") blocksAll = true;
  }
  const sitemaps = lines.filter((l) => /^sitemap\s*:/i.test(l)).map((l) => l.replace(/^sitemap\s*:/i, "").trim()).slice(0, 10);
  return { present: true, blocksAllCrawlers: blocksAll, sitemaps };
}

export function summarizeSitemap(xml: string | null) {
  if (xml === null) return { present: false, urlCount: 0, isIndex: false };
  return { present: /<(urlset|sitemapindex)[\s>]/i.test(xml), urlCount: (xml.match(/<loc>/gi) ?? []).length, isIndex: /<sitemapindex[\s>]/i.test(xml) };
}

const metaContent = (html: string, attr: "name" | "property", key: string) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? (tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").slice(0, 300) : null;
};
export function summarizeSeoTags(html: string) {
  const types = new Set<string>(); let invalidJsonLd = 0;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(walk);
        const o = obj(v); const t = o["@type"];
        if (typeof t === "string") types.add(t); else arr(t).forEach((x) => typeof x === "string" && types.add(x));
        arr(o["@graph"]).forEach(walk);
      };
      walk(JSON.parse(m[1]!));
    } catch { invalidJsonLd += 1; }
  }
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']*)["']/i)?.[1] ?? null;
  const robotsMeta = metaContent(html, "name", "robots");
  const og = { title: metaContent(html, "property", "og:title"), description: metaContent(html, "property", "og:description"), image: metaContent(html, "property", "og:image"), type: metaContent(html, "property", "og:type") };
  const twitterCard = metaContent(html, "name", "twitter:card");
  const missing = [!canonical && "canonical", !og.title && "og:title", !og.description && "og:description", !og.image && "og:image", !twitterCard && "twitter:card", types.size === 0 && "structured data"].filter(Boolean) as string[];
  return { canonical, robotsMeta, noindex: /noindex/i.test(robotsMeta ?? ""), openGraph: og, twitterCard, structuredDataTypes: [...types].slice(0, 20), invalidJsonLd, missing };
}

export const CRTSH_URL = (domain: string) => `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json&exclude=expired`;
export function summarizeCrtsh(raw: unknown, domain: string, now = Date.now()) {
  const rows = arr(raw).map(obj);
  const names = new Set<string>(); const issuers = new Set<string>(); let latestExpiry: string | null = null;
  for (const r of rows) {
    for (const n of (str(r["name_value"]) ?? "").split("\n")) {
      const h = n.trim().toLowerCase();
      if (h && (h === domain || h.endsWith(`.${domain}`))) names.add(h);
    }
    const iss = str(r["issuer_name"])?.match(/O=([^,]+)/)?.[1]; if (iss) issuers.add(iss.trim());
    const na = str(r["not_after"]); if (na && (!latestExpiry || na > latestExpiry)) latestExpiry = na;
  }
  const days = latestExpiry ? Math.floor((Date.parse(`${latestExpiry}Z`) - now) / 86400000) : null;
  return { domain, activeCertificates: rows.length, hostnames: [...names].sort().slice(0, 40), hostnameCount: names.size, issuers: [...issuers].slice(0, 6), latestExpiry, daysUntilLatestExpiry: Number.isFinite(days) ? days : null };
}

export const NOMINATIM_URL = (q: string) => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
export function cleanPlaceQuery(v: unknown) {
  const q = typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 160) : "";
  return q.length >= 3 ? q : null;
}
export function summarizeNominatim(raw: unknown) {
  return {
    results: arr(raw).map(obj).slice(0, 5).map((r) => ({
      name: str(r["name"]) || null, address: str(r["display_name"])?.slice(0, 240) ?? null,
      kind: [str(r["category"]), str(r["type"])].filter(Boolean).join("/") || null,
      lat: str(r["lat"]), lon: str(r["lon"]),
    })),
    attribution: "© OpenStreetMap contributors (ODbL)",
  };
}
