/**
 * City/state page uniqueness gate (Lovable round 10, item 1).
 *
 * The hand-written local pages (`src/content/seo/local/*.md`) are the only
 * local pages in the sitemap, so each must stay substantially its own copy:
 * a new page cloned from another with a few place names swapped would be a
 * thin/duplicate-content page. This test measures copy overlap with word
 * 3-gram (shingle) Jaccard similarity and enforces a minimum visible word
 * count. The `/locations/<city>` pages share one template, so for them the
 * gate pins what makes each one distinct: its city facts and its head tags.
 *
 * Thresholds are set with headroom above today's worst case (max pairwise
 * Jaccard ≈ 0.27, contractors AZ ~ NC; shortest page ≈ 518 words); raise the
 * copy quality of a new page rather than these numbers.
 */
import { describe, expect, it } from "vitest";

import { NC_LOCATIONS, type NcLocation } from "@/lib/business-identity";
import { LOCAL_DOCS, plainText } from "@/lib/seo-docs";
import { Route as LocationRoute } from "@/routes/locations.$city";

const MAX_SHINGLE_JACCARD = 0.35;
const MIN_LOCAL_PAGE_WORDS = 450;

/** Lower-cased visible words of a Markdown body. */
function visibleWords(markdown: string): string[] {
  return plainText(markdown)
    .toLowerCase()
    .replace(/[^a-z0-9$%]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Set of consecutive `size`-word sequences in `words`. */
function shingles(words: readonly string[], size = 3): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

/** |A ∩ B| / |A ∪ B|; 0 for two empty sets. */
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

describe("similarity helpers", () => {
  it("scores identical copy 1, disjoint copy 0 and a one-word swap high", () => {
    const base = visibleWords("Raleigh HVAC owners need fast quotes, honest booking and steady follow-up every week.");
    const swapped = visibleWords("Durham HVAC owners need fast quotes, honest booking and steady follow-up every week.");
    expect(jaccard(shingles(base), shingles(base))).toBe(1);
    expect(jaccard(shingles(base), shingles(visibleWords("Completely different words live here today")))).toBe(0);
    expect(jaccard(shingles(base), shingles(swapped))).toBeGreaterThan(MAX_SHINGLE_JACCARD);
  });

  it("strips Markdown so links and bold do not change the score", () => {
    expect(visibleWords("**Fast** [quotes](/x) here")).toEqual(["fast", "quotes", "here"]);
  });
});

describe("hand-written local pages are unique", () => {
  const docs = LOCAL_DOCS.map((doc) => ({ doc, grams: shingles(visibleWords(doc.body)) }));

  it("has the hand-written pages to check", () => {
    expect(docs.length).toBeGreaterThanOrEqual(2);
  });

  it(`keeps every pair under ${MAX_SHINGLE_JACCARD} 3-gram Jaccard similarity`, () => {
    const tooSimilar: string[] = [];
    docs.forEach((a, i) => {
      for (const b of docs.slice(i + 1)) {
        const score = jaccard(a.grams, b.grams);
        if (score >= MAX_SHINGLE_JACCARD) tooSimilar.push(`${a.doc.path} ~ ${b.doc.path}: ${score.toFixed(3)}`);
      }
    });
    expect(tooSimilar).toEqual([]);
  });

  it(`gives every page at least ${MIN_LOCAL_PAGE_WORDS} visible words`, () => {
    const thin = docs
      .filter(({ doc }) => visibleWords(doc.body).length < MIN_LOCAL_PAGE_WORDS)
      .map(({ doc }) => `${doc.path}: ${visibleWords(doc.body).length}`);
    expect(thin).toEqual([]);
  });

  it("gives every page its own path, title, meta description and H1", () => {
    for (const key of ["path", "title", "description", "h1"] as const) {
      const values = LOCAL_DOCS.map((doc) => doc[key].trim().toLowerCase());
      expect(new Set(values).size, key).toBe(values.length);
    }
  });
});

describe("/locations city pages carry distinct city facts and head tags", () => {
  type Head = { meta?: Array<Record<string, string>>; links?: Array<Record<string, string>> };
  const headFor = (location: NcLocation): Head =>
    (LocationRoute as unknown as { options: { head: (a: unknown) => Head } }).options.head({
      match: { context: { location } },
    });
  const metaValue = (head: Head, key: string, value: string) =>
    head.meta?.find((m) => m[key] === value)?.["content"];

  it("never repeats a slug, city, county or nearby-town list, and never lists a city as its own neighbour", () => {
    for (const key of ["slug", "city", "county"] as const) {
      const values = NC_LOCATIONS.map((l) => l[key].toLowerCase());
      expect(new Set(values).size, key).toBe(values.length);
    }
    const nearbyLists = NC_LOCATIONS.map((l) => [...l.nearby].map((n) => n.toLowerCase()).sort().join("|"));
    expect(new Set(nearbyLists).size).toBe(nearbyLists.length);
    for (const location of NC_LOCATIONS) {
      expect(location.nearby.length, location.slug).toBeGreaterThanOrEqual(3);
      expect(location.nearby.map((n) => n.toLowerCase()), location.slug).not.toContain(location.city.toLowerCase());
      expect(new Set(location.nearby).size, location.slug).toBe(location.nearby.length);
    }
  });

  it("gives every city page its own title, description and canonical URL naming that city", () => {
    const heads = NC_LOCATIONS.map((location) => ({ location, head: headFor(location) }));
    const titles = heads.map(({ head }) => head.meta?.find((m) => "title" in m)?.["title"] ?? "");
    const descriptions = heads.map(({ head }) => metaValue(head, "name", "description") ?? "");
    const canonicals = heads.map(({ head }) => head.links?.find((l) => l["rel"] === "canonical")?.["href"] ?? "");
    for (const values of [titles, descriptions, canonicals]) expect(new Set(values).size).toBe(values.length);
    heads.forEach(({ location }, i) => {
      expect(titles[i], location.slug).toContain(location.city);
      expect(descriptions[i], location.slug).toContain(location.city);
      expect(canonicals[i], location.slug).toContain(`/locations/${location.slug}`);
    });
  });
});
