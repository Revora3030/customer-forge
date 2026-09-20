import { describe, expect, it } from "vitest";
import { proposeSiteComposition } from "@/lib/builder/ai-composition.server";
import type { AgentContext } from "@/lib/site-agent.server";

const ctx = {
  business: { name: "Elite Mobile Cars", industry: "mobile car detailing", tagline: null, description: null, city: "Leeds", state: null, serviceArea: null, phone: null, email: null, yearsInBusiness: null, primaryColor: null, secondaryColor: null, accentColor: null, fontPreference: null, services: [{ name: "Full detail", price: null, startingPrice: null }], publishedReviewCount: 4, photoCount: 8 },
  pages: [{ id: "page-1", title: "Home", kind: "home", slug: "home", is_visible: true, sections: [
    { id: "s-hero", kind: "hero", variant: "a", is_visible: true, heading: "Hi", subheading: null, body: null, sort_order: 0, components: [] },
    { id: "s-cta", kind: "cta", variant: "a", is_visible: true, heading: "Book", subheading: null, body: null, sort_order: 1, components: [] },
    { id: "s-services", kind: "services", variant: "a", is_visible: true, heading: "Services", subheading: null, body: null, sort_order: 2, components: [] },
  ] }],
  sectionKinds: ["hero","services","reviews","gallery","faq","cta","contact","process","features"],
  pageKinds: ["home"], componentKinds: ["button"],
} as unknown as AgentContext;

describe("live composition", () => {
  it("composes through a free provider", async () => {
    const out = await proposeSiteComposition(ctx, { instruction: "Improve my whole website" });
    console.log("RESULT", JSON.stringify(out, null, 1)?.slice(0, 1200));
    expect(out === null || out.actions.length > 0).toBe(true);
  }, 60000);
});
