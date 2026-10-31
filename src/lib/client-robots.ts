/**
 * robots.txt for one published client website.
 *
 * Names the search and AI crawlers that should read the site, and points at
 * that client's sitemap only. An offline or non-indexable site tells every
 * crawler to stay out and lists no pages. Nothing here is Revora's own
 * marketing inventory.
 */

export const CLIENT_SITE_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "*",
] as const;

export function clientSiteRobotsTxt(input: { indexable: boolean; sitemapUrl: string | null }): string {
  const lines: string[] = [];
  for (const agent of CLIENT_SITE_CRAWLERS) {
    lines.push(`User-agent: ${agent}`, input.indexable ? "Allow: /" : "Disallow: /", "");
  }
  const sitemap = input.sitemapUrl?.replace(/[\r\n\s]/g, "") ?? "";
  if (input.indexable && sitemap.startsWith("https://")) {
    lines.push(`Sitemap: ${sitemap}`, "");
  }
  return lines.join("\n");
}
