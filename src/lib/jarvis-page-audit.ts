/**
 * Page SEO/structure snapshot through Browserbase Fetch (BROWSERBASE_API_KEY).
 * One read-only request for one allow-listed page; parses the returned HTML.
 */
export const BROWSERBASE_FETCH_ENDPOINT = "https://api.browserbase.com/v1/fetch";

export type PageAuditSummary = {
  url: string;
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  noindex: boolean;
  h1Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  hasViewportMeta: boolean;
  hasStructuredData: boolean;
  issues: string[];
};

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "").trim() : null;
};
const metaTags = (html: string) => html.match(/<meta\b[^>]*>/gi) ?? [];
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function summarizePageFetch(raw: unknown, url: string): PageAuditSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const html = typeof r["content"] === "string" ? r["content"] : null;
  if (html === null) return null;
  const httpStatus = typeof r["statusCode"] === "number" ? r["statusCode"] : null;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1] ?? "").slice(0, 200) || null : null;
  const metas = metaTags(html);
  const byName = (n: string) => metas.find((t) => attr(t, "name")?.toLowerCase() === n);
  const descTag = byName("description");
  const metaDescription = descTag ? decode(attr(descTag, "content") ?? "").slice(0, 300) || null : null;
  const robots = byName("robots");
  const noindex = Boolean(robots && /noindex/i.test(attr(robots, "content") ?? ""));
  const canonTag = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) => attr(t, "rel")?.toLowerCase() === "canonical");
  const canonical = canonTag ? attr(canonTag, "href") : null;
  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesMissingAlt = imgs.filter((t) => attr(t, "alt") === null).length;
  const hasViewportMeta = Boolean(byName("viewport"));
  const hasStructuredData = /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html);
  const issues: string[] = [];
  if (httpStatus === null || httpStatus >= 400) issues.push(`Page returned status ${httpStatus ?? "unknown"}.`);
  if (!title) issues.push("Missing page title.");
  else if (title.length > 65) issues.push("Title is longer than about 60 characters.");
  if (!metaDescription) issues.push("Missing meta description.");
  if (!canonical) issues.push("Missing canonical link.");
  if (noindex) issues.push("Page is marked noindex.");
  if (h1Count !== 1) issues.push(`Found ${h1Count} main headings (expected 1).`);
  if (imagesMissingAlt > 0) issues.push(`${imagesMissingAlt} image(s) missing alt text.`);
  if (!hasViewportMeta) issues.push("Missing mobile viewport tag.");
  return { url, httpStatus, title, metaDescription, canonical, noindex, h1Count, imageCount: imgs.length, imagesMissingAlt, hasViewportMeta, hasStructuredData, issues };
}
