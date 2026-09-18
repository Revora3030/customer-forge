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
    expect(plan.trace.some((item) => item.includes("Autonomous Brain v3"))).toBe(true);
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

  it("normalises typos and conversational wording before autonomous matching", () => {
    const plan = buildAutonomousPlan(context, "plz make my webiste look premuim and get me more custmers");
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.trace.some((item) => item.includes("normalised and inspected the existing workspace"))).toBe(true);
    expect(plan.trace.some((item) => item.includes("customer acquisition"))).toBe(true);
    expect(plan.trace.some((item) => item.includes("premium presentation"))).toBe(true);
  });

  it("carries a prior subject into a follow-up request", () => {
    const plan = buildAutonomousPlan(context, "make it better", {
      history: ["make the hero look premium"],
    });
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.trace.some((item) => item.includes("Autonomous Brain v3: carried forward the prior subject"))).toBe(true);
  });

  it("uses bounded focused passes for broad multi-goal requests", () => {
    const plan = buildAutonomousPlan(
      context,
      "make the whole site look premium, get more customers, improve local SEO, and fix mobile",
    );

    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.length).toBeLessThanOrEqual(56);
    expect(plan.trace.some((item) => item.includes("Autonomous Brain v6: ran"))).toBe(true);
    expect(plan.trace.some((item) => item.includes("Autonomous Brain v7: self-critique"))).toBe(true);

    const keys = plan.actions.map((action) => JSON.stringify(action));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps explicit requests on the existing compiler path", () => {
    const plan = buildAutonomousPlan(context, "change the hero heading");
    expect(plan.actions.length).toBeGreaterThanOrEqual(0);
    expect(plan.trace.some((item) => item.includes("Site readiness"))).toBe(true);
  });
});
