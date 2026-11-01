import { describe, expect, it } from "vitest";
import { fallbackImageAlt, foreignCityIn, imageAltBase, mentionsWrongCity, normalizeCanonicalUrl } from "./client-seo-guard";
import { clientPageSearchText, localBusinessSchema, shareImageFor, tenantSiteHead, type TenantHeadSite } from "./site-head";

const base = (over: Partial<TenantHeadSite> = {}, page: Record<string, unknown> | null = { kind: "home", slug: "home", title: "Home" }): TenantHeadSite => ({
  org: { name: "Elite Mobile Detailing", slug: "elite-mobile-detailing", industry: "Auto detailing" },
  profile: { city: "Raleigh", state: "NC", tagline: "We come to you.", hero_image_url: "https://cdn.test/hero.jpg" },
  settings: { generation: null, seo: null },
  reviews: [],
  services: [],
  content: page ? { page, sections: [{ settings: {} }] } : null,
  ...over,
});
const meta = (head: ReturnType<typeof tenantSiteHead>, key: string) =>
  (head.meta.find((m) => ("property" in m && m.property === key) || ("name" in m && m.name === key)) as { content?: string } | undefined)?.content;
const titleOf = (head: ReturnType<typeof tenantSiteHead>) => (head.meta.find((m) => "title" in m) as { title: string }).title;

describe("normalizeCanonicalUrl", () => {
  it("gives every canonical one shape", () => {
    expect(normalizeCanonicalUrl("https://Example.com/About/")).toBe("https://example.com/About");
    expect(normalizeCanonicalUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeCanonicalUrl("https://example.com/a//b/?utm=1#x")).toBe("https://example.com/a/b");
    expect(normalizeCanonicalUrl("not a url")).toBe("not a url");
  });
});

describe("wrong-city guard", () => {
  it("flags a known city that is not the business's own", () => {
    expect(foreignCityIn("Mobile detailing in Austin, TX", ["Raleigh", "NC"])).toBe("Austin");
    expect(foreignCityIn("Mobile detailing in Raleigh", ["Raleigh"])).toBeNull();
    expect(foreignCityIn("Anything", [])).toBeNull();
  });
  it("keeps wording that names the business's own city next to neighbours", () => {
    expect(mentionsWrongCity("Plumbing in Raleigh, Durham and Cary", { city: "Raleigh" })).toBe(false);
    expect(mentionsWrongCity("Detailing in Austin", { city: "Raleigh" })).toBe(true);
    expect(mentionsWrongCity("Detailing in Austin", { city: null })).toBe(false);
    expect(mentionsWrongCity("Detailing in Austin", { city: "Round Rock", serviceArea: "Austin, Round Rock" })).toBe(false);
  });
});

describe("image alt fallback", () => {
  it("builds a description from the record without inventing", () => {
    expect(imageAltBase({ name: "Elite Mobile Detailing", industry: "Auto detailing", city: "Raleigh" })).toBe("Elite Mobile Detailing, Auto detailing in Raleigh");
    expect(imageAltBase({ name: "Acme Plumbing", industry: "plumbing", city: null })).toBe("Acme Plumbing");
    expect(imageAltBase({ name: "", city: "Raleigh" })).toBe("");
    expect(fallbackImageAlt("Acme", 1)).toBe("Acme");
    expect(fallbackImageAlt("Acme", 3)).toBe("Acme — photo 3");
    expect(fallbackImageAlt("", 2)).toBe("");
  });
});

describe("clientPageSearchText", () => {
  it("drops a title and description that name another city", () => {
    const out = clientPageSearchText({
      isHome: true, label: "Home", name: "Elite Mobile Detailing", city: "Raleigh", state: "NC", industry: "Auto detailing",
      seoTitle: "Mobile Detailing in Austin", seoDescription: "Best detailing in Austin, TX.",
    });
    expect(out.title).toBe("Elite Mobile Detailing — Auto detailing in Raleigh");
    expect(out.description).toContain("Raleigh");
    expect(out.description).not.toContain("Austin");
  });
  it("keeps authored wording that is right for the city", () => {
    const out = clientPageSearchText({ isHome: true, label: "Home", name: "Acme", city: "Raleigh", seoTitle: "Roofing in Raleigh | Acme", seoDescription: "Roof repair in Raleigh and Cary." });
    expect(out.title).toBe("Roofing in Raleigh | Acme");
    expect(out.description).toBe("Roof repair in Raleigh and Cary.");
  });
  it("never lets a placeholder phone or email into the description", () => {
    const out = clientPageSearchText({ isHome: true, label: "Home", name: "Acme", city: "Raleigh", seoDescription: "Call (919) 555-0142 or hello@acme.example for roof repair in Raleigh." });
    expect(out.description).not.toMatch(/555|\.example/);
  });
  it("enriches thin fallbacks with the trade and keeps lengths sensible", () => {
    const inner = clientPageSearchText({ isHome: false, label: "Pricing", name: "Elite Mobile Detailing", city: "Raleigh", industry: "Auto detailing", pageSlug: "pricing" });
    expect(inner.description).toBe("Pricing from Elite Mobile Detailing, Auto detailing in Raleigh.");
    expect(inner.title.length).toBeLessThanOrEqual(60);
    expect(inner.description.length).toBeLessThanOrEqual(160);
  });
});

describe("tenantSiteHead gen-site SEO", () => {
  it("normalizes the canonical and og:url, adds locale and image alt", () => {
    const head = tenantSiteHead({ site: base(), canonical: "https://Elite.example.com/", businessUrl: "https://e.test" });
    expect(head.links[0]).toEqual({ rel: "canonical", href: "https://elite.example.com" });
    expect(meta(head, "og:url")).toBe("https://elite.example.com");
    expect(meta(head, "og:locale")).toBe("en_US");
    expect(meta(head, "og:image:alt")).toBe("Elite Mobile Detailing, Auto detailing in Raleigh");
    expect(meta(head, "twitter:image:alt")).toBe("Elite Mobile Detailing, Auto detailing in Raleigh");
  });
  it("falls back to the owner's logo for the share image", () => {
    expect(shareImageFor({ logo: "https://cdn.test/logo.png" })).toBe("https://cdn.test/logo.png");
    expect(shareImageFor({ ogImage: "https://cdn.test/og.png", logo: "https://cdn.test/logo.png" })).toBe("https://cdn.test/og.png");
    expect(shareImageFor({ logo: "http://cdn.test/logo.png" })).toBeNull(); // DevSkim: ignore DS137138 -- Negative fixture: plaintext share images must be rejected.
    const head = tenantSiteHead({ site: base({ profile: { city: "Raleigh", logo_url: "https://cdn.test/logo.png" } }), canonical: "https://e.test", businessUrl: "https://e.test" });
    expect(meta(head, "og:image")).toBe("https://cdn.test/logo.png");
  });
  it("never puts another city in a Raleigh business's title", () => {
    const head = tenantSiteHead({
      site: base({}, { kind: "home", slug: "home", title: "Home", seo_title: "Auto Detailing in Austin — Elite" }),
      canonical: "https://e.test", businessUrl: "https://e.test",
    });
    expect(titleOf(head)).not.toMatch(/Austin/);
    expect(titleOf(head)).toContain("Raleigh");
  });
  it("emits one JSON-LD block of each payload and no placeholder contact", () => {
    const head = tenantSiteHead({ site: base({ profile: { city: "Raleigh", description: "Call (919) 555-0142 for detailing." } }), canonical: "https://e.test", businessUrl: "https://e.test" });
    const blocks = head.scripts.map((s) => s.children ?? "");
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(blocks.join("")).not.toMatch(/555-01/);
    expect(blocks.join("")).not.toMatch(/aggregateRating|"review"/);
  });
  it("matches the schema type to the trade", () => {
    const type = (industry: string) => localBusinessSchema({ name: "X", url: "https://e.test", industry, profile: { city: "Raleigh" } })["@type"];
    expect(type("Plumbing")).toBe("Plumber");
    expect(type("HVAC")).toBe("HVACBusiness");
  });
});
