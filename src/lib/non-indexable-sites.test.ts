import { describe, expect, it } from "vitest";
import { hasTestSlug, isNonIndexableSite, tenantSiteHead, type TenantHeadSite } from "./site-head";
import { indexablePlatformEntries } from "./seo-intent";

describe("test, demo and sample sites stay out of search", () => {
  it("recognises whole-word test/demo/sample slugs only", () => {
    for (const slug of ["oak-city-plumbing-test-demo", "demo", "sample-bakery", "test-site", "acme-example"]) expect(hasTestSlug(slug)).toBe(true);
    for (const slug of ["contest-hub", "oak-city-plumbing", "sampler-cafe", "protest-print", ""]) expect(hasTestSlug(slug)).toBe(false);
  });
  it("flags demo workspaces and sample contact data", () => {
    expect(isNonIndexableSite({ isDemo: true, slug: "real-name" })).toBe(true);
    expect(isNonIndexableSite({ slug: "real-name", profile: { email: "owner@example.com" } })).toBe(true);
    expect(isNonIndexableSite({ slug: "real-name", profile: { email: "owner@realbiz.com", phone: "919-555-2368" } })).toBe(false);
  });
  it("serves noindex on a test-slug site even with real-looking contact data", () => {
    const site: TenantHeadSite = {
      org: { name: "Oak City Plumbing", slug: "oak-city-plumbing-test" },
      profile: { city: "Raleigh", email: "owner@realbiz.com" },
      settings: { generation: null, seo: null },
      reviews: [],
      services: [],
      content: { page: { kind: "home", slug: "home", title: "Home" }, sections: [{ settings: {}, components: [] }] },
    };
    const head = tenantSiteHead({ site, canonical: "https://x.test/", businessUrl: "https://x.test/" });
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex" });
  });
  it("never lists demo or test routes in the platform sitemap", () => {
    for (const entry of indexablePlatformEntries()) expect(entry.path).not.toMatch(/(^|\/|-)(demo|test|sample|example|share|preview)(\/|-|$)/i);
  });
});
