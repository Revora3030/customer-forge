import { describe, expect, it } from "vitest";
import { knownPageSlugs, menuItems, missingChromeLinks, repairStoredLinks, resolveSiteHref } from "@/lib/builder/site-chrome";

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

  it("sends a button back to the page it is on to that page's form", () => {
    const sections = [
      { id: "s1", kind: "composition", settings: { composition: { version: 1, root: { type: "button", text: "Get a Quote", href: "/contact" } } } },
    ];
    const anchors = new Set(["contact", "contact-form"]);
    expect(repairStoredLinks(sections, pages, anchors, "contact")[0]?.settings.composition.root.href).toBe("#contact-form");
    expect(repairStoredLinks(sections, pages, anchors, "services")[0]?.settings.composition.root.href).toBe("/contact");
  });
});

describe("buttons with no destination", () => {
  it("get the enquiry form on the page, else the enquiry page", () => {
    const tree = { type: "row", children: [{ type: "button", text: "Get a quote" }, { type: "link", text: "Call", href: "tel:9195550142" }] };
    const onPage = repairStoredLinks(tree, pages, new Set(["contact-form"]));
    expect(onPage.children[0]).toMatchObject({ href: "#contact-form" });
    expect(onPage.children[1]).toMatchObject({ href: "tel:9195550142" });
    const elsewhere = repairStoredLinks(tree, pages, new Set<string>());
    expect(elsewhere.children[0]).toMatchObject({ href: "/contact" });
  });

  it("fills CTAs that lost their destination", () => {
    const out = repairStoredLinks({ type: "mobile_sticky_bar", primaryCta: { label: "Book now" } }, pages, null);
    expect(out.primaryCta).toMatchObject({ label: "Book now", href: "/contact" });
  });

  it("prefers a quote or booking page when there is no contact page", () => {
    const quoteSite = knownPageSlugs([{ slug: "home" }, { slug: "get-a-quote" }]);
    expect(resolveSiteHref("#", "acme", true, quoteSite)).toBe("/get-a-quote");
  });
});

describe("phone menu", () => {
  it("lists every link and action even when the design hides a group on phones", () => {
    const tree = {
      version: 1 as const,
      root: {
        type: "row" as const,
        children: [
          { type: "stack" as const, responsive: { mobile: { hidden: true } }, children: [
            { type: "link" as const, text: "Services", href: "/services" },
            { type: "link" as const, text: "Services", href: "/services" },
            { type: "link" as const, text: "About" },
          ] },
          { type: "button" as const, text: "Get a quote", href: "/contact" },
        ],
      },
    };
    expect(menuItems(tree as never)).toEqual([
      { href: "/services", label: "Services", action: false },
      { href: "", label: "About", action: false },
      { href: "/contact", label: "Get a quote", action: true },
    ]);
    expect(menuItems(null)).toEqual([]);
  });
});
