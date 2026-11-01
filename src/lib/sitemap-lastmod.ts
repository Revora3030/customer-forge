/**
 * Truthful <lastmod> dates for Revora's own sitemap.
 *
 * A page's date is the last time something that renders it changed in git:
 * its route file, the data module it reads, and (for Markdown pages) its own
 * content file. `scripts/gen-sitemap-lastmod.ts` reads that history and writes
 * `sitemap-lastmod.generated.ts`, which is committed because the build
 * environment's clone may be shallow and could not recompute it. Guides keep
 * their hand-maintained `updated` field instead (see seo-intent.ts).
 *
 * Nothing here ever produces a date after the generation day: dates come from
 * commit history only, and a page with no known source falls back to the day
 * the table was generated.
 */
import { SITEMAP_LASTMOD } from "@/lib/sitemap-lastmod.generated";
import { lastmodDocKeyFor, lastmodGroupFor } from "@/lib/sitemap-lastmod-sources";

const later = (a: string | undefined, b: string | undefined) =>
  a && b ? (a > b ? a : b) : (a ?? b);

/**
 * `YYYY-MM-DD` for a sitemap path. The page's own Markdown file date wins
 * over its group's templates only when it is later; with no known source the
 * table's generation day is used.
 */
export function sitemapLastmodFor(path: string): string {
  const group = lastmodGroupFor(path);
  const groupDate = group ? SITEMAP_LASTMOD.groups[group] : undefined;
  const docKey = lastmodDocKeyFor(path);
  const docDate = docKey ? SITEMAP_LASTMOD.docs[docKey] : undefined;
  return later(groupDate, docDate) ?? SITEMAP_LASTMOD.generatedAt;
}
