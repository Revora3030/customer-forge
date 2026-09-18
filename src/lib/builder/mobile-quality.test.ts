import { describe, expect, it } from "vitest";
import { mobileQualitySummary, scoreMobileQuality } from "./mobile-quality";

const context = {
  business: {
    name: "Demo", industry: "service", tagline: null, description: null, city: "Carrboro",
    state: "NC", serviceArea: null, phone: null, email: null, yearsInBusiness: null,
    primaryColor: null, secondaryColor: null, accentColor: null, fontPreference: null,
    services: [], publishedReviewCount: 0, photoCount: 0,
  },
  pages: [{
    id: "home", slug: "/", title: "Home", kind: "home", is_visible: true, noindex: false,
    seo_title: "Home", seo_description: "Home",
    sections: [
      { id: "hero", kind: "hero", variant: "default", is_visible: true, heading: "Book today",
        subheading: "A clear service", body: null, sort_order: 0,
        components: [{ id: "cta", kind: "button", label: "Book now", body: null, link_label: "Book now", link_url: "/book", sort_order: 0 }] },
      { id: "services", kind: "services", variant: "default", is_visible: true, heading: "Services",
        subheading: null, body: null, sort_order: 1,
        components: Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, kind: "card", label: "Service", body: null, link_label: null, link_url: null, sort_order: i })) },
      { id: "gallery", kind: "gallery", variant: "default", is_visible: true, heading: "Work",
        subheading: null, body: null, sort_order: 2,
        components: [{ id: "img", kind: "image", label: null, body: null, link_label: null, link_url: null, sort_order: 0 }] },
    ],
  }],
  sectionKinds: ["hero", "services", "gallery"], pageKinds: ["home"], componentKinds: ["button", "card", "image"],
} as const;

describe("mobile-quality", () => {
  it("produces deterministic scores and a useful summary", () => {
    const first = scoreMobileQuality(context as never);
    const second = scoreMobileQuality(context as never);
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.dimensions.layout).toBeGreaterThanOrEqual(80);
    expect(first.dimensions.interaction).toBeGreaterThanOrEqual(80);
    expect(mobileQualitySummary(first)).toContain("Deterministic mobile-quality scan");
  });
});
