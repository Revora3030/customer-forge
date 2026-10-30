import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  localBusinessSchema,
  openingHoursSpec,
  safeJsonLd,
  siteIconLinks,
  siteThemeColor,
  tenantSiteHead,
  type TenantHeadSite,
} from "./site-head";
import { compositionFonts, siteFontsHref, isLight } from "./site-theme";
import { metaTitle } from "./seo";

const site = (page: Record<string, unknown> | null, over: Partial<TenantHeadSite> = {}): TenantHeadSite => ({
  org: { name: "Test Business Co." },
  profile: { city: "Austin", tagline: "Detailing that comes to you.", hero_image_url: "https://cdn.test/hero.jpg" },
  settings: { generation: null, seo: null },
  reviews: [],
  services: [],
  content: page ? { page, sections: [] } : null,
  ...over,
});

const meta = (head: ReturnType<typeof tenantSiteHead>, key: string) =>
  head.meta.find(
    (entry) =>
      ("property" in entry && entry.property === key) ||
      ("name" in entry && entry.name === key),
  ) as { content?: string } | undefined;
const titleOf = (head: ReturnType<typeof tenantSiteHead>) =>
  (head.meta.find((entry) => "title" in entry) as { title: string }).title;

describe("metaTitle", () => {
  const long =
    "Fleet Maintenance Detail in Austin, Round Rock, Cedar Park, Pflugerville and Georgetown — Elite Mobile Detailing";
  it("cuts a 112-character title at a word boundary of 60 or fewer", () => {
    expect(long.length).toBe(112);
    const out = metaTitle(long, "Elite Mobile Detailing");
    expect(out.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(out)).toBe(true);
    // Never mid-word: the original continues with a space or punctuation.
    expect(long[out.length]).toMatch(/[\s,]/);
    expect(out).toBe("Fleet Maintenance Detail in Austin, Round Rock, Cedar Park");
    expect(out).not.toMatch(/[,—\s]$/);
  });
  it("collapses a doubled business-name suffix", () => {
    expect(metaTitle("Services — Test Business Co. — Test Business Co.", "Test Business Co.")).toBe(
      "Services — Test Business Co.",
    );
    expect(metaTitle("Services | Acme | Acme | Acme", "Acme")).toBe("Services | Acme");
  });
  it("drops the suffix when the name already appears earlier", () => {
    expect(metaTitle("Acme Roofing Repairs — Acme", "Acme")).toBe("Acme Roofing Repairs");
  });
  it("keeps short, clean titles as written", () => {
    expect(metaTitle("Roof repair in Raleigh — Acme", "Acme")).toBe("Roof repair in Raleigh — Acme");
  });
});

describe("tenantSiteHead (one head for every client route)", () => {
  const routes = [
    "src/routes/s.$slug.tsx",
    "src/routes/s.$slug.$page.tsx",
    "src/routes/$.tsx",
    "src/routes/index.tsx",
    "src/lib/tenant-page-utils.ts",
  ];
  it.each(routes)("%s uses the shared head and no inline title slicing", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("tenantSiteHead({");
    expect(src).not.toMatch(/\.slice\(0, 60\)/);
    expect(src).not.toContain("clientHeadExtrasSync(");
  });

  it("de-duplicates a doubled business name in a stored seo_title", () => {
    const head = tenantSiteHead({
      site: site({ kind: "page", slug: "services", title: "Services", seo_title: "Services — Test Business Co. — Test Business Co." }),
      pageSlug: "services",
      canonical: "https://revoragrowthsystems.com/s/test/services",
      businessUrl: "https://revoragrowthsystems.com/s/test",
    });
    expect(titleOf(head)).toBe("Services — Test Business Co.");
  });

  it("emits og:image, og:site_name, twitter card, og:url and LocalBusiness data", () => {
    const head = tenantSiteHead({
      site: site({ kind: "page", slug: "about", title: "About" }),
      pageSlug: "about",
      canonical: "https://acme.test/about",
      businessUrl: "https://acme.test/",
    });
    expect(titleOf(head)).toBe("About — Test Business Co.");
    expect(meta(head, "og:image")?.content).toBe("https://cdn.test/hero.jpg");
    expect(meta(head, "twitter:image")?.content).toBe("https://cdn.test/hero.jpg");
    expect(meta(head, "og:site_name")?.content).toBe("Test Business Co.");
    expect(meta(head, "twitter:card")?.content).toBe("summary_large_image");
    expect(meta(head, "og:url")?.content).toBe("https://acme.test/about");
    expect(meta(head, "description")?.content).toBe("Detailing that comes to you.");
    expect(head.links[0]).toEqual({ rel: "canonical", href: "https://acme.test/about" });
    expect(head.scripts.some((script) => script.children.includes('"LocalBusiness"'))).toBe(true);
    expect(meta(head, "robots")).toBeUndefined();
  });

  it("uses the home fallback for the home page and keeps it within 60 characters", () => {
    const head = tenantSiteHead({
      site: site({ kind: "home", slug: "home", title: "Home", seo_title: null }),
      pageSlug: null,
      canonical: "https://acme.test",
      businessUrl: "https://acme.test",
    });
    expect(titleOf(head)).toBe("Test Business Co. — Austin");
  });

  it("propagates noindex from the page or the caller", () => {
    const fromPage = tenantSiteHead({
      site: site({ kind: "thanks", slug: "thanks", title: "Thanks", noindex: true }),
      pageSlug: "thanks",
      canonical: "https://acme.test/thanks",
      businessUrl: "https://acme.test/",
    });
    expect(meta(fromPage, "robots")?.content).toBe("noindex");
    const fromCaller = tenantSiteHead({
      site: site({ kind: "page", slug: "faq", title: "FAQ" }),
      pageSlug: "faq",
      canonical: "https://acme.test/faq",
      businessUrl: "https://acme.test/",
      noindex: true,
    });
    expect(meta(fromCaller, "robots")?.content).toBe("noindex");
  });

  it("keeps an empty home page out of search and hands it no ratings or reviews", () => {
    const head = tenantSiteHead({
      site: site(
        { kind: "home", slug: "home", title: "Home" },
        { reviews: [{ rating: 5, author_name: "A", comment: "x" }, { rating: 5, author_name: "B", comment: "y" }] as never },
      ),
      pageSlug: null,
      canonical: "https://acme.test",
      businessUrl: "https://acme.test",
    });
    expect(meta(head, "robots")?.content).toBe("noindex");
    const ld = head.scripts.map((s) => s.children).join("");
    expect(ld).not.toContain("aggregateRating");
    expect(ld).not.toContain("\"review\"");
  });

  it("treats a published site with no home page at all (content is null) as the same empty shell", () => {
    // Live 2026-10-30: /s/elite-mobile-detailing rendered "This website is still
    // being built" yet was indexable and carried AggregateRating + reviews.
    const head = tenantSiteHead({
      site: site(null, { reviews: [{ rating: 5, author_name: "A", comment: "x" }] as never }),
      pageSlug: null,
      canonical: "https://acme.test",
      businessUrl: "https://acme.test",
    });
    expect(meta(head, "robots")?.content).toBe("noindex");
    const ld = head.scripts.map((s) => s.children).join("");
    expect(ld).not.toContain("aggregateRating");
    expect(ld).not.toContain("\"review\"");
  });

  it("indexes a home page that has sections and still shows its real reviews", () => {
    const head = tenantSiteHead({
      site: site(
        { kind: "home", slug: "home", title: "Home" },
        {
          reviews: [{ rating: 5, author_name: "A", comment: "x" }] as never,
          content: { page: { kind: "home", slug: "home", title: "Home" }, sections: [{ settings: {} }] },
        },
      ),
      pageSlug: null,
      canonical: "https://acme.test",
      businessUrl: "https://acme.test",
    });
    expect(meta(head, "robots")).toBeUndefined();
    expect(head.scripts.map((s) => s.children).join("")).toContain("aggregateRating");
  });

  it("never emits a non-https share image", () => {
    const head = tenantSiteHead({
      site: site({ kind: "page", slug: "faq", title: "FAQ", og_image_url: "org/a.jpg" }, { profile: { hero_image_url: "http://x/y.jpg" } }), // DevSkim: ignore DS137138 -- Negative fixture: plaintext share images must be rejected.
      pageSlug: "faq",
      canonical: "https://acme.test/faq",
      businessUrl: "https://acme.test/",
    });
    expect(meta(head, "og:image")).toBeUndefined();
  });
});

describe("client site head", () => {
  it("adds customer FAQ data from that page's saved composition only", () => {
    const head = tenantSiteHead({
      site: site({ kind: "page", slug: "faq", title: "Questions" }, {
        content: { page: { kind: "page", slug: "faq", title: "Questions" }, sections: [{ settings: { composition: { version: 1, root: {
          type: "faq_accordion", faqItems: [{ question: "When can I book?", answer: "By appointment." }],
        } } } }] },
      }),
      canonical: "https://acme.test/faq", businessUrl: "https://acme.test/", pageSlug: "faq",
    });
    const faq = head.scripts.map((script) => JSON.parse(script.children) as Record<string, unknown>).find((schema) => schema["@type"] === "FAQPage");
    expect(faq?.["mainEntity"]).toEqual([{ "@type": "Question", name: "When can I book?", acceptedAnswer: { "@type": "Answer", text: "By appointment." } }]);
    const other = tenantSiteHead({ site: site({ kind: "home", title: "Home" }), canonical: "https://other.test/", businessUrl: "https://other.test/" });
    expect(other.scripts.some((script) => script.children.includes('"FAQPage"'))).toBe(false);
  });
  it("builds LocalBusiness data only from real facts", () => {
    const schema = localBusinessSchema({
      name: "Acme Roofing",
      url: "https://acme.test",
      profile: { phone: "(555) 010-0199", city: "Raleigh", state: "NC", hours: { monday: "9am-5pm", sunday: "Closed" } },
      reviews: [{ rating: 5, author_name: "Jo", comment: "Great" }, { rating: 4 }],
      services: [{ name: "Roof repair", price: 250 }],
    });
    expect(schema["@type"]).toBe("LocalBusiness");
    expect(schema["telephone"]).toBe("(555) 010-0199");
    expect((schema["address"] as Record<string, string>)["addressLocality"]).toBe("Raleigh");
    expect((schema["aggregateRating"] as Record<string, number>)["ratingValue"]).toBe(4.5);
    expect(schema["openingHoursSpecification"]).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:00" },
    ]);
    expect(schema["email"]).toBeUndefined();
  });
  it("omits ratings when there are no reviews", () => {
    const schema = localBusinessSchema({ name: "X", url: "https://x.test", profile: null });
    expect(schema["aggregateRating"]).toBeUndefined();
  });
  it("reads 9-5 as 09:00-17:00", () => {
    expect(openingHoursSpec({ tue: "9-5" })[0]).toMatchObject({ opens: "09:00", closes: "17:00" });
  });
  it("cannot break out of the script tag", () => {
    const out = safeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
  it("uses the business logo and colour, never an unsafe value", () => {
    expect(siteIconLinks({ logo_url: "https://cdn.test/logo.png" })[0]?.href).toBe("https://cdn.test/logo.png");
    expect(siteIconLinks({ logo_url: "org/logo.png" })).toEqual([]);
    expect(siteThemeColor({ primary_color: "#112233" })).toBe("#112233");
    expect(siteThemeColor({ primary_color: "red;}" })).toBeNull();
  });
});

describe("client page shell", () => {
  it("adds no top gap above a first section that paints its own surface", () => {
    const src = readFileSync("src/routes/s.$slug.$page.tsx", "utf8");
    expect(src).not.toContain('<main className="scroll-mt-20 pt-2 sm:pt-4');
    expect(src).toContain('firstSectionHasSurface(sections[0]?.settings) ? "" : "pt-2 sm:pt-4 "');
    expect(src).toMatch(/readBlockStyle\(settings\)[\s\S]{0,80}style\.bgColor \|\| style\.bgImage/);
  });
});

describe("layout fonts", () => {
  it("loads fonts named inside AI layouts", () => {
    const fonts = compositionFonts([
      { root: { type: "stack", children: [{ type: "heading", style: { font: "Fraunces" } }, { type: "text", style: { font: "Arial" } }] } },
      { root: { type: "row", responsive: { mobile: { font: "Lora" } } } },
      // Stock faces are left to the site's own pairing and never downloaded.
      { root: { type: "heading", style: { font: "Inter" } } },
    ]);
    expect(fonts).toEqual(["Fraunces", "Lora"]);
    const href = siteFontsHref("Sora", fonts)!;
    expect(href).toContain("family=Sora");
    expect(href).toContain("family=Fraunces");
  });
  it("rejects unsafe font names", () => {
    expect(compositionFonts([{ root: { type: "text", style: { font: "x);}body{" } } }])).toEqual([]);
  });
});

describe("readable text on brand colours", () => {
  it("uses dark text on mid-tone colours where white would be unreadable", () => {
    expect(isLight("#f59e0b")).toBe(true); // amber
    expect(isLight("#38bdf8")).toBe(true); // sky
    expect(isLight("#1e3a8a")).toBe(false); // navy
  });
});
