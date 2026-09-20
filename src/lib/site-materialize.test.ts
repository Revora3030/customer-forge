import { describe, expect, it } from "vitest";
import { planSiteContent, type MaterializeInput } from "@/lib/site-materialize.server";
import { materializedSectionDesign } from "@/lib/site-materialize.server";
import { DESIGN_DIRECTIONS } from "@/lib/design-directions";

const input: MaterializeInput = {
  businessName: "Journey Detailing",
  copy: {
    heroHeadline: "Mobile detailing in Tampa, done right",
    heroSubheadline: "We come to you.",
    primaryCta: "Get a price",
    secondaryCta: "See services",
    intro: "Journey Detailing cleans cars at your home or office.",
    about: "We started detailing in Tampa.",
    benefits: ["We come to you", "Fixed prices"],
    serviceCards: [{ name: "Full detail", copy: "Inside and out." }],
    faqs: [{ question: "How long does it take?", answer: "About two hours." }],
    areaCopy: "We work across Tampa.",
    metaTitle: "Mobile detailing in Tampa",
    metaDescription: "Book a mobile detail in Tampa.",
    ogTitle: "Mobile detailing in Tampa",
    ogDescription: "Book a mobile detail in Tampa.",
  },
  services: [{ name: "Full detail", description: null, price: 180, starting_price: null }],
  city: "Tampa",
  state: "FL",
  serviceArea: null,
  phone: "8135550123",
  email: "hi@journey.test",
  yearsInBusiness: 4,
  photoCount: 0,
  hasQuoteForm: true,
  hasBooking: true,
};

describe("planSiteContent", () => {
  it("builds a home page plus the core pages", () => {
    const pages = planSiteContent(input);
    const slugs = pages.map((page) => page.slug);
    expect(slugs[0]).toBe("home");
    expect(pages[0]!.kind).toBe("home");
    expect(slugs).toEqual(
      expect.arrayContaining(["home", "services", "pricing", "about", "book", "contact"]),
    );
  });

  it("fills the home page with real content", () => {
    const home = planSiteContent(input)[0]!;
    const kinds = home.sections.map((section) => section.kind);
    expect(kinds).toContain("hero");
    expect(kinds).toContain("services");
    expect(kinds).toContain("faq");
    expect(kinds).toContain("quote");
    const hero = home.sections.find((section) => section.kind === "hero")!;
    expect(hero.heading).toContain("Tampa");
    expect(hero.components?.[0]?.link_url).toBe("/#quote");
  });

  it("omits sections that have no supplied facts", () => {
    const bare = planSiteContent({
      ...input,
      services: [],
      copy: { ...input.copy, serviceCards: [], benefits: [], faqs: [] },
      yearsInBusiness: null,
      city: null,
      state: null,
      phone: null,
      hasQuoteForm: false,
      hasBooking: false,
    });
    const home = bare[0]!;
    const kinds = home.sections.map((section) => section.kind);
    expect(kinds).not.toContain("services");
    expect(kinds).not.toContain("benefits");
    expect(kinds).not.toContain("trust_bar");
    expect(bare.map((page) => page.slug)).not.toContain("pricing");
  });

  it("gives every first-build section a visible, industry-specific design contract", () => {
    const direction = DESIGN_DIRECTIONS.find((item) => item.id === "coastal-blue");
    expect(direction).toBeTruthy();
    const hero = materializedSectionDesign("hero", direction);
    const services = materializedSectionDesign("services", direction);
    expect(hero.variant).toMatch(/^hero-/);
    expect(hero.settings).toMatchObject({
      effect: direction?.heroEffect,
      visual: { layout: "layered", max_width: "wide", image_treatment: "rounded" },
    });
    expect(services.variant).toMatch(/^cards-/);
    expect(services.settings).toMatchObject({
      effect: direction?.bodyEffect,
      visual: { layout: "editorial", card_style: "soft" },
    });
  });
});
