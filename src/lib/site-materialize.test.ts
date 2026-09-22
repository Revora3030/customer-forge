import { describe, expect, it } from "vitest";
import { planSiteContent, type MaterializeInput } from "@/lib/site-materialize.server";
import { materializedSectionDesign } from "@/lib/site-materialize.server";
import { DESIGN_DIRECTIONS } from "@/lib/design-directions";
import { classifyArchetype } from "@/lib/site-archetypes";
import { createDesignFingerprint } from "@/lib/builder/design-fingerprint";
import { playbookFor } from "@/lib/builder/industry";

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

  it("turns the full fingerprint into materially different rendered contracts", () => {
    const direction = DESIGN_DIRECTIONS.find((item) => item.id === "coastal-blue");
    const a = createDesignFingerprint({ businessName: "Journey Detailing", industry: "automotive", city: "Tampa", photoCount: 4 });
    const b = createDesignFingerprint({ businessName: "Northstar Dental", industry: "dental", city: "Tampa", photoCount: 4 });
    const first = materializedSectionDesign("hero", direction, a, 0);
    const second = materializedSectionDesign("hero", direction, b, 0);
    expect(first.variant).not.toBe(second.variant);
    expect(first.settings).not.toEqual(second.settings);
  });

  it("orders the home story from the detected industry's conversion playbook", () => {
    const playbook = playbookFor("Emergency plumbing");
    const home = planSiteContent({ ...input, industryPlaybook: playbook })[0]!;
    const kinds = home.sections.map((section) => section.kind);
    expect(kinds[0]).toBe("hero");
    expect(kinds.at(-1)).toBe("sticky_cta");
    expect(kinds.indexOf("services")).toBeLessThan(kinds.indexOf("faq"));
  });

  it("creates an image-led, conversion-ready landing page for each supplied service", () => {
    const pages = planSiteContent(input);
    const servicePages = pages.filter((page) => page.slug.startsWith("services/"));
    expect(servicePages).toHaveLength(input.services.length);
    expect(servicePages[0]?.sections.map((section) => section.kind)).toEqual(
      expect.arrayContaining(["hero", "service_detail", "cta"]),
    );
    const serviceLinks = pages[0]?.sections
      .find((section) => section.kind === "services")
      ?.components?.map((component) => component.link_url);
    expect(serviceLinks).toContain(`/services/${input.services[0]!.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
  });

  it("gives core interior pages a deliberate opening, useful body, and closing action", () => {
    const pages = planSiteContent(input);
    for (const slug of ["services", "pricing", "about", "book"]) {
      const page = pages.find((candidate) => candidate.slug === slug)!;
      expect(page.sections[0]?.kind).toBe("hero");
      expect(page.sections.at(-1)?.kind).toBe("cta");
      expect(page.sections.length).toBeGreaterThanOrEqual(3);
    }
    const contact = pages.find((page) => page.slug === "contact")!;
    expect(contact.sections[0]?.kind).toBe("hero");
    expect(contact.sections.map((section) => section.kind)).toContain("quote");
  });
});

describe("planSiteContent with a website archetype", () => {
  it("shapes the site for the kind of business it is", () => {
    const restaurant = classifyArchetype({ industry: "Restaurant" });
    const pages = planSiteContent({ ...input, photoCount: 6, archetype: restaurant });
    expect(pages.map((page) => page.slug)).toEqual(expect.arrayContaining(["menu", "visit"]));
    const home = pages[0]!;
    expect(home.sections.map((s) => s.kind)).toContain("gallery");
    // the closing CTA stays last (before the sticky bar)
    const kinds = home.sections.map((s) => s.kind);
    expect(kinds.indexOf("cta")).toBeGreaterThan(kinds.indexOf("gallery"));
  });

  it("gives different industries different structures", () => {
    const shapes = ["Restaurant", "Dental", "Gym", "Hotel", "Law"].map((industry) =>
      planSiteContent({
        ...input,
        photoCount: 4,
        archetype: classifyArchetype({ industry }),
      })
        .map((page) => page.slug)
        .join(","),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("leaves out archetype sections with no supplied facts", () => {
    const pages = planSiteContent({
      ...input,
      photoCount: 0,
      services: [],
      archetype: classifyArchetype({ industry: "Restaurant" }),
    });
    const kinds = pages.flatMap((page) => page.sections.map((s) => s.kind));
    expect(kinds).not.toContain("gallery");
    expect(kinds).not.toContain("reviews");
  });

  it("keeps image-led archetype sections when starter AI pictures were generated", () => {
    const pages = planSiteContent({
      ...input,
      photoCount: 0,
      archetype: classifyArchetype({ industry: "Restaurant" }),
      generatedAssets: [{
        slot: "service",
        label: "Dining room",
        altText: "Restaurant dining room",
        path: "org/generated-dining-room.webp",
        mediaId: "media-1",
        provider: "test",
        model: "test-image",
        prompt: "Editorial restaurant interior",
        placement: ["gallery"],
        aspectRatio: "3:2",
      }],
    });
    expect(pages[0]?.sections.map((section) => section.kind)).toContain("gallery");
  });
});
