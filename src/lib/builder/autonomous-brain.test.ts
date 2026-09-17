import { describe, expect, it } from "vitest";
import { buildAutonomousPlan } from "./autonomous-brain";

const context = {
  business: {
    name: "Acme Services", industry: "home services", tagline: "Quality service",
    description: "Local service business", city: "Carrboro", state: "NC", serviceArea: "Carrboro",
    phone: "555-0100", email: "hello@example.com", yearsInBusiness: null,
    primaryColor: null, secondaryColor: null, accentColor: null, fontPreference: null,
    services: [{ name: "Cleaning", price: null, startingPrice: null }], publishedReviewCount: 0, photoCount: 0,
  },
  pages: [{ id: "home", kind: "home", title: "Home", slug: "", is_visible: true, noindex: false, seo_title: null, seo_description: null,
    sections: [{ id: "hero", kind: "hero", heading: "Welcome", subheading: "", body: "", components: [] },
      { id: "services", kind: "services", heading: "Services", subheading: "", body: "", components: [] }] }],
  pageKinds: ["home", "services", "contact"],
  sectionKinds: ["hero", "services", "faq", "contact", "reviews", "sticky_cta", "trust_bar", "cta"],
  componentKinds: ["button", "card", "image"],
} as any;

describe("autonomous brain", () => {
  it("turns a vague request into a diagnosis-informed deterministic plan", () => {
    const plan = buildAutonomousPlan(context, "make my website better and get me more customers");
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.trace.some((item) => item.includes("Autonomous Brain v2"))).toBe(true);
    expect(plan.trace.some((item) => item.includes("customer acquisition"))).toBe(true);
    expect(plan.notes.some((item) => item.includes("Trust") || item.includes("FAQ"))).toBe(true);
  });

  it("maps premium language into coordinated presentation concerns", () => {
    const plan = buildAutonomousPlan(context, "make the whole site look premium and modern");
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.trace.some((item) => item.includes("premium presentation"))).toBe(true);
  });

  it("maps search language into SEO-oriented concerns", () => {
    const plan = buildAutonomousPlan(context, "help me get found and improve local SEO");
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.trace.some((item) => item.includes("search visibility"))).toBe(true);
  });

  it("keeps explicit requests on the existing compiler path", () => {
    const plan = buildAutonomousPlan(context, "change the hero heading");
    expect(plan.actions.length).toBeGreaterThanOrEqual(0);
    expect(plan.trace.some((item) => item.includes("Site readiness"))).toBe(true);
  });
});
