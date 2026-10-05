import { describe, expect, it } from "vitest";
import { knownPageSlugs, missingChromeLinks, repairStoredLinks, resolveSiteHref } from "@/lib/builder/site-chrome";

const nav = [
  { slug: "home", title: "Home", kind: "home" },
  { slug: "services", title: "Services", kind: "page" },
  { slug: "contact", title: "Contact", kind: "page" },
];
const pages = knownPageSlugs(nav);

describe("AI-authored buttons always go somewhere real", () => {
  it("keeps working links exactly as before", () => {
    expect(resolveSiteHref("/services", "acme", false, pages)).toBe("/s/acme/services");
    expect(resolveSiteHref("/", "acme", false, pages)).toBe("/s/acme");
    expect(resolveSiteHref("/services", "acme", true, pages)).toBe("/services");
    expect(resolveSiteHref("tel:+15551234567", "acme", false, pages)).toBe("tel:+15551234567");
    expect(resolveSiteHref("https://maps.google.com/?q=x", "acme", false, pages)).toBe("https://maps.google.com/?q=x");
  });

  it("is unchanged when the page list is unknown", () => {
    expect(resolveSiteHref("/missing", "acme", false)).toBe("/s/acme/missing");
    expect(resolveSiteHref("#contact", "acme", false, null)).toBe("#contact");
  });

  it("repairs links to pages the site does not have", () => {
    expect(resolveSiteHref("/book-now", "acme", false, pages)).toBe("/s/acme/contact");
    expect(resolveSiteHref("/book-now", "acme", true, pages)).toBe("/contact");
    const noContact = knownPageSlugs([{ slug: "home" }, { slug: "services" }]);
    expect(resolveSiteHref("/book-now", "acme", false, noContact)).toBe("/s/acme");
  });

  it("repairs empty and placeholder destinations", () => {
    expect(resolveSiteHref("", "acme", false, pages)).toBe("/s/acme/contact");
    expect(resolveSiteHref("#", "acme", false, pages)).toBe("/s/acme/contact");
  });

  it("sends a #section with no matching section to the page of that name", () => {
    expect(resolveSiteHref("#contact", "acme", false, pages)).toBe("/s/acme/contact");
    expect(resolveSiteHref("#contact", "acme", false, pages, new Set(["contact"]))).toBe("#contact");
    expect(resolveSiteHref("#faq", "acme", false, pages)).toBe("#faq");
  });

  it("lists pages the AI menu left out", () => {
    const tree = { version: 1 as const, root: { type: "row" as const, children: [{ type: "link" as const, text: "Services", href: "/services" }] } };
    expect(missingChromeLinks(tree as never, nav).map((l) => l.slug)).toEqual(["contact"]);
    expect(missingChromeLinks(null, nav).map((l) => l.slug)).toEqual(["services", "contact"]);
  });
});

describe("links inside AI-authored sections are repaired too", () => {
  it("repairs hrefs, ctaHrefs and link_urls without touching anything else", () => {
    const sections = [
      {
        id: "s1",
        kind: "composition",
        settings: { composition: { version: 1, root: { type: "button", text: "Book", href: "/book-now", style: { color: "#fff" } } } },
        components: [{ id: "c1", link_url: "#contact", url: "https://cdn.example/x.jpg" }],
      },
      { id: "s2", kind: "custom", settings: { spec: { type: "booking", ctaHref: "/services", ctaLabel: "Go" } } },
    ];
    const out = repairStoredLinks(sections, pages, new Set<string>());
    const composition = out[0]?.settings?.composition;
    const component = out[0]?.components?.[0];
    const spec = out[1]?.settings?.spec;
    expect(composition?.root.href).toBe("/contact");
    expect(composition?.root.style?.color).toBe("#fff");
    expect(component?.link_url).toBe("/contact");
    expect(component?.url).toBe("https://cdn.example/x.jpg");
    expect(spec?.ctaHref).toBe("/services");
    expect(repairStoredLinks(sections, null, null)).toBe(sections);
  });
});
