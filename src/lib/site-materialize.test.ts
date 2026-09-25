import { describe, expect, it } from "vitest";
import type { MaterializeInput } from "@/lib/site-materialize.server";
import { materializedSectionDesign } from "@/lib/site-materialize.server";
import { parseAuthoredDirection } from "@/lib/authored-direction";
const AUTHORED_LOOK = {
  name: "Test authored look",
  mood: "Written by the model under test.",
  bestFor: "Tests",
  primary: "#1f6feb",
  secondary: "#0b1020",
  accent: "#f5c451",
  font: "Fraunces",
  fontNote: "test",
  backdrop: "none",
  backdropSpec: null,
  sectionEffects: { hero: "none" },
  defaultEffect: "rise",
};

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

describe("AI-only materialization", () => {
  it("applies no house layout of its own when there is no authored identity", () => {
    const direction = parseAuthoredDirection(AUTHORED_LOOK);
    expect(direction).toBeTruthy();
    const hero = materializedSectionDesign("hero", direction);
    const services = materializedSectionDesign("services", direction);
    expect(hero.variant).toBe("default");
    expect(services.variant).toBe("default");
    expect(hero.settings).toMatchObject({ effect: direction?.sectionEffects["hero"] });
    expect(services.settings).toMatchObject({ effect: direction?.defaultEffect });
    expect((hero.settings as { visual?: unknown }).visual).toBeUndefined();
    expect((services.settings as { visual?: unknown }).visual).toBeUndefined();
  });
});

describe("applyAuthoredHeadings", () => {
  it("uses only AI-written section headings", async () => {
    const { applyAuthoredHeadings } = await import("@/lib/site-materialize.server");
    const pages = [{ slug: "home", title: "Home", kind: "home", sections: [
      { kind: "hero", heading: "AI hero" },
      { kind: "services", heading: "What we do" },
      { kind: "faq", heading: "Common questions" },
    ] }] as never;
    const out = applyAuthoredHeadings(pages, [{ slug: "home", title: "Home", purpose: "home", primaryAction: "Call", sections: [
      { role: "hero" }, { role: "services", heading: "Roofs we fix", subheading: null }, { role: "faq" },
    ] }]) as unknown as { sections: { heading: string | null }[] }[];
    expect(out[0]!.sections.map((s) => s.heading)).toEqual(["AI hero", "Roofs we fix", null]);
  });
});


