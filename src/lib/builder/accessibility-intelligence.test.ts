import { describe, expect, it } from "vitest";
import {
  accessibilitySummary,
  compileAccessibilityRepairs,
  findAccessibilityFindings,
  scoreAccessibility,
} from "./accessibility-intelligence";
import type { AgentContext } from "@/lib/site-agent.server";

const context: AgentContext = {
  business: {
    name: "Test Business",
    industry: "cleaning",
    tagline: "Clean spaces",
    description: "Professional cleaning.",
    city: "Carrboro",
    state: "NC",
    serviceArea: "Triangle",
    phone: null,
    email: "test@example.com",
    yearsInBusiness: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    fontPreference: null,
    publishedReviewCount: 0,
    photoCount: 0,
    services: [{ name: "Cleaning", price: null, startingPrice: null }],
  },
  pages: [
    {
      id: "home",
      slug: "",
      title: "Home",
      kind: "home",
      is_visible: true,
      seo_title: "Home",
      seo_description: "Home",
      seo_canonical: null,
      og_title: null,
      og_description: null,
      noindex: false,
      sections: [
        {
          id: "hero",
          kind: "hero",
          variant: "default",
          heading: "Clean spaces",
          subheading: null,
          body: null,
          is_visible: true,
          components: [
            {
              id: "image",
              kind: "image",
              label: null,
              body: null,
              link_url: null,
              link_label: null,
            },
            {
              id: "book",
              kind: "button",
              label: "Book today",
              body: null,
              link_url: "/book",
              link_label: null,
            },
          ],
        },
        {
          id: "services",
          kind: "services",
          variant: "default",
          heading: null,
          subheading: null,
          body: null,
          is_visible: true,
          components: [],
        },
      ],
    },
  ],
  sectionKinds: ["hero", "services"],
  pageKinds: ["home"],
};

describe("accessibility-intelligence", () => {
  it("finds and repairs safe gaps", () => {
    const findings = findAccessibilityFindings(context);
    expect(findings.some((f) => f.kind === "missing_heading")).toBe(true);
    expect(findings.some((f) => f.kind === "missing_link_label")).toBe(true);
    expect(findings.some((f) => f.kind === "missing_alt")).toBe(true);
    const repairs = compileAccessibilityRepairs(context, "make the site accessible");
    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.type).toBe("set_component");
  });

  it("scores deterministically", () => {
    const first = scoreAccessibility(context);
    expect(first).toEqual(scoreAccessibility(context));
    expect(first.score).toBeGreaterThan(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.dimensions.media).toBeLessThan(80);
    expect(accessibilitySummary(first)).toContain("Deterministic accessibility scan");
  });
});
