import { describe, expect, it } from "vitest";
import { auditLinks, autoFixable, preflight, type PreflightInput } from "@/lib/preflight";
import type { ContentPage } from "@/lib/website-content";

const component = (over: Partial<ContentPage["sections"][number]["components"][number]> = {}) => ({
  id: "c1",
  section_id: "s1",
  kind: "button",
  label: "Get a quote",
  body: null,
  media_url: null,
  link_url: "/book",
  link_label: "Get a quote",
  settings: null,
  sort_order: 0,
  is_visible: true,
  ...over,
});

const section = (over: Partial<ContentPage["sections"][number]> = {}) => ({
  id: "s1",
  page_id: "p1",
  kind: "hero",
  variant: "default",
  heading: "Mobile detailing in Raleigh",
  subheading: null,
  body: null,
  settings: null,
  sort_order: 0,
  is_visible: true,
  components: [component()],
  ...over,
});

const page = (over: Partial<ContentPage> = {}): ContentPage => ({
  id: "p1",
  slug: "home",
  title: "Home",
  kind: "home",
  sort_order: 0,
  is_visible: true,
  seo_title: "Mobile detailing",
  seo_description: "Mobile detailing across Raleigh.",
  seo_canonical: null,
  og_title: null,
  og_description: null,
  og_image_url: null,
  noindex: false,
  sections: [section(), section({ id: "s2", kind: "services", components: [] })],
  ...over,
});

const healthy = (): PreflightInput => ({
  pages: [page(), page({ id: "p2", slug: "book", title: "Book", kind: "book" })],
  businessName: "Elite Detailing",
  phone: "919-555-0100",
  email: "hi@elite.test",
  city: "Raleigh",
  serviceArea: "Wake County",
  description: "Mobile detailing.",
  hasHours: true,
  servicesCount: 4,
  pricedServicesCount: 3,
  bookableCount: 2,
  quoteFormCount: 1,
  quoteQuestionCount: 4,
  mediaCount: 8,
  analyticsConfigured: true,
  notifiesOwner: true,
  followUpAutomations: 2,
  seoTitle: "Mobile detailing in Raleigh",
  seoDescription: "Book mobile detailing in Raleigh.",
  publicHost: "elitedetailing.com",
  httpsVerified: true,
  canPublish: true,
});

describe("preflight", () => {
  it("clears a fully configured site for publishing", () => {
    const result = preflight(healthy());
    expect(result.blockers).toHaveLength(0);
    expect(result.publishSafe).toBe(true);
    expect(result.score).toBe(100);
    expect(result.summary).toContain("100%");
  });

  it("blocks publishing when the account cannot publish", () => {
    const result = preflight({
      ...healthy(),
      canPublish: false,
      canPublishReason: "Setup payment outstanding.",
    });
    expect(result.publishSafe).toBe(false);
    expect(result.blockers.map((b) => b.key)).toContain("account");
    expect(result.nextStep?.key).toBe("account");
  });

  it("blocks a site with no pages and no way to enquire", () => {
    const result = preflight({
      ...healthy(),
      pages: [],
      quoteFormCount: 0,
      bookableCount: 0,
      quoteQuestionCount: 0,
    });
    const keys = result.blockers.map((b) => b.key);
    expect(keys).toContain("pages-exist");
    expect(keys).toContain("home-page");
    expect(keys).toContain("capture");
    expect(result.publishSafe).toBe(false);
  });

  it("skips booking hours when nothing is bookable", () => {
    const result = preflight({ ...healthy(), bookableCount: 0, hasHours: false });
    const hours = result.checks.find((c) => c.key === "booking-hours");
    expect(hours?.status).toBe("skip");
  });

  it("flags broken internal links and unsafe links but not valid externals", () => {
    const audit = auditLinks([
      page({
        sections: [
          section({
            components: [
              component({ id: "a", link_url: "/book" }),
              component({ id: "b", link_url: "/missing" }),
              component({ id: "c", link_url: "javascript:alert(1)" }),
              component({ id: "d", link_url: "tel:9195550100" }),
              component({ id: "e", link_url: "https://example.com" }),
              component({ id: "f", link_url: "/home#hero" }),
              component({ id: "g", link_url: "/home#nope" }),
            ],
          }),
        ],
      }),
      page({ id: "p2", slug: "book", kind: "book" }),
    ]);
    expect(audit.broken).toEqual(["/missing", "/home#nope"]);
    expect(audit.unsafe).toEqual(["javascript:alert(1)"]);
    expect(audit.external).toBe(2);
  });

  it("reports unsafe links as a security blocker Revora can fix itself", () => {
    const result = preflight({
      ...healthy(),
      pages: [
        page({
          sections: [
            section({ components: [component({ link_url: "javascript:alert(1)" })] }),
            section({ id: "s2", kind: "services", components: [] }),
            section({ id: "s3", kind: "book", components: [] }),
          ],
        }),
      ],
    });
    const unsafe = result.blockers.find((c) => c.key === "unsafe-links");
    expect(unsafe).toBeTruthy();
    expect(autoFixable(result).map((c) => c.key)).toContain("unsafe-links");
  });

  it("treats missing search description as a warning, not a blocker", () => {
    const result = preflight({ ...healthy(), seoDescription: null });
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings.map((w) => w.key)).toContain("seo-description");
    expect(result.publishSafe).toBe(true);
  });

  it("never claims a page has content when sections are hidden", () => {
    const hidden = page({
      sections: [section({ is_visible: false }), section({ id: "s2", is_visible: false })],
    });
    const result = preflight({ ...healthy(), pages: [hidden] });
    expect(result.blockers.map((b) => b.key)).toContain("sections");
  });
});
