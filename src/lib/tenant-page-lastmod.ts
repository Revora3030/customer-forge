/**
 * Per-page <lastmod> for a client site's sitemap (G-SGE-6 / CG-16).
 *
 * Each publish stores a full copy of the site (website_versions, live_format 1).
 * A page's lastmod is the publish time of the oldest version, in the unbroken
 * run ending at the live one, whose copy of that page (its fields, sections and
 * components) is identical to what is live now. So a publish that only changed
 * the About page leaves Services dated to when Services last really changed.
 * Never later than the live publish, never invented: with no history the live
 * publish time is used, as before.
 */
type Row = Record<string, unknown>;
export type PublishedVersion = { publishedAt: string | null; pages: Row[] };

/** Row ids and ordering keys are not content; a restore may renumber them. */
const IGNORED = new Set(["id", "page_id", "section_id", "organization_id", "created_at", "updated_at"]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const key of Object.keys(value as Row).sort()) {
      if (!IGNORED.has(key)) out[key] = canonical((value as Row)[key]);
    }
    return out;
  }
  return value;
}

/** A stable fingerprint of one page as visitors see it. */
export function pageFingerprint(page: Row): string {
  return JSON.stringify(canonical(page));
}

/**
 * `versions` newest first; versions[0] is live. Returns slug -> ISO date for
 * every slug on the live version.
 */
export function perPageLastmod(versions: readonly PublishedVersion[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const live = versions[0];
  if (!live) return result;
  const older = versions.slice(1).map((v) => ({
    publishedAt: v.publishedAt,
    bySlug: new Map(v.pages.map((p) => [String(p["slug"] ?? ""), pageFingerprint(p)])),
  }));
  for (const page of live.pages) {
    const slug = String(page["slug"] ?? "");
    const print = pageFingerprint(page);
    let date = live.publishedAt;
    for (const version of older) {
      if (!version.publishedAt || version.bySlug.get(slug) !== print) break;
      date = version.publishedAt;
    }
    result.set(slug, date);
  }
  return result;
}
