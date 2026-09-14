import { describe, expect, it } from "vitest";
import { applyAutopilot, diagnoseSite } from "./autopilot";
import { interpret } from "./interpreter";

const context = (overrides: Partial<any> = {}) => ({
  business: {
    name: "Acme Services",
    industry: "home services",
    tagline: "Quality service",
    description: "Local service business",
    city: "Carrboro",
    state: "NC",
    serviceArea: "Carrboro",
    phone: null,
    email: null,
    services: [{ name: "Cleaning", price: null, startingPrice: null }],
    publishedReviewCount: 0,
  },
  pages: [
    {
      id: "home",
      kind: "home",
      title: "Home",
      slug: "",
      sections: [
        { id: "hero", kind: "hero", heading: "Welcome", subheading: "", body: "", components: [] },
        { id: "services", kind: "services", heading: "Services", subheading: "", body: "", components: [] },
      ],
    },
  ],
  pageKinds: ["home", "services", "custom"],
  sectionKinds: ["hero", "services", "faq", "contact", "reviews", "sticky_cta", "trust_bar"],
  ...overrides,
});

describe("autopilot builder intelligence", () => {
  it("turns vague improvement requests into a multi-goal plan", () => {
    const intent = applyAutopilot(context(), "make my website better", interpret("make my website better"));
    expect(intent.goals).toEqual(expect.arrayContaining(["redesign", "conversion", "mobile", "visual"]));
    expect(intent.verbs).toEqual(expect.arrayContaining(["fix", "hierarchy"]));
  });

  it("understands outcome language without requiring builder vocabulary", () => {
    const intent = applyAutopilot(context(), "get me more calls and bookings", interpret("get me more calls and bookings"));
    expect(intent.goals).toEqual(expect.arrayContaining(["conversion", "leads", "calls", "booking"]));
    expect(intent.verbs).toContain("cta");
  });

  it("detects site weaknesses from persisted context", () => {
    const diagnosis = diagnoseSite(context());
    expect(diagnosis.pages).toBe(1);
    expect(diagnosis.missingFaq).toBe(true);
    expect(diagnosis.missingContact).toBe(true);
    expect(diagnosis.completeness).toBeGreaterThanOrEqual(0);
    expect(diagnosis.completeness).toBeLessThanOrEqual(100);
  });

  it("never invents business facts", () => {
    const intent = applyAutopilot(context(), "make it better", interpret("make it better"));
    expect(intent.constraints).not.toContain("invent_facts");
  });
});
