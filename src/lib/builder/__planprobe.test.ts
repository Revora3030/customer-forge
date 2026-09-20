import { describe, expect, it } from "vitest";
import { buildAutonomousPlan } from "@/lib/builder/autonomous-brain";
const context = {
  business: { name: "Example HVAC", industry: "HVAC", tagline: "Comfort when you need it", description: "Heating and cooling services", city: "Carrboro", state: "NC", serviceArea: "Carrboro", phone: null, email: null, yearsInBusiness: null, primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#d4af37", fontPreference: null, services: [{ name: "AC repair", price: null, startingPrice: null }], publishedReviewCount: 0, photoCount: 0 },
  pages: [{ id: "page-home", slug: "/", title: "Home", kind: "home", is_visible: true, noindex: false, seo_title: null, seo_description: null, sections: [{ id: "s1", kind: "hero", variant: "default", is_visible: true, heading: "Heating and cooling services", subheading: null, body: null, sort_order: 0, components: [] }] }],
  sectionKinds: ["hero","cta","faq","services"], pageKinds: ["home"], componentKinds: ["button"],
} as never;
const probes = [
 "Make the home page headline clearer about what we do and add a strong call to action.",
 "Make the home page headline clearer",
 "add a strong call to action",
 "make the headline clearer about what we do",
 "rewrite the home page headline",
];
describe("probe", () => { for (const p of probes) it(p, () => { const plan = buildAutonomousPlan(context, p); console.log(JSON.stringify({p, n: plan.actions.length, q: plan.questions, cov: plan.coverage, ext: plan.requiresExternalReasoning})); expect(true).toBe(true); }); });
