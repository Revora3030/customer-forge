import { describe, expect, it } from "vitest";

import { compileAutonomousEngineering } from "./autonomous-engineering";
import type { AgentContext } from "@/lib/site-agent.server";

function context(): AgentContext {
  return {
    business: {
      name: "Acme Home Services",
      industry: "home services",
      tagline: "Reliable work",
      description: "Professional home services.",
      city: "Carrboro",
      state: "NC",
      serviceArea: "Carrboro and Chapel Hill",
      phone: null,
      email: "hello@example.com",
      services: [{ name: "Repairs", price: null, startingPrice: null }],
      publishedReviewCount: 0,
    },
    pages: [
      {
        id: "home",
        slug: "/",
        title: "Home",
        kind: "home",
        sections: [
          {
            id: "hero",
            kind: "hero",
            sort_order: 0,
            heading: "Welcome",
            subheading: "",
            body: "",
            components: [],
          },
          {
            id: "services",
            kind: "services",
            sort_order: 1,
            heading: "",
            subheading: "",
            body: "",
            components: [],
          },
        ],
      },
    ],
    pageKinds: ["home", "custom", "services"],
    sectionKinds: ["hero", "services", "cta", "sticky_cta"],
  } as unknown as AgentContext;
}

describe("Autonomous Engineering 2.0", () => {
  it("creates bounded CTA and content repairs without inventing a destination", () => {
    const result = compileAutonomousEngineering(
      context(),
      "improve conversions and fill empty content",
      true,
      12,
    );

    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.length).toBeLessThanOrEqual(12);
    expect(result.summary).toMatch(/Autonomous Engineering 2.0/);
    expect(result.recoveryStrategy.length).toBeGreaterThan(0);
  });

  it("does not fabricate a CTA target when no safe target exists", () => {
    const ctx = context();
    ctx.business.email = null;
    ctx.business.phone = null;
    ctx.business.services = [];
    const result = compileAutonomousEngineering(ctx, "improve conversions", false, 12);

    expect(result.blocked.join(" ")).toMatch(/destination|target/i);
  });

  it("keeps runtime-only evidence explicitly separated", () => {
    const result = compileAutonomousEngineering(context(), "make it accessible and fast", true, 8);

    expect(result.runtimeRequired).toEqual(
      expect.arrayContaining([
        "contrast measurement",
        "Core Web Vitals",
        "desktop/mobile visual comparison",
      ]),
    );
  });

  it("detects duplicate slugs and placeholder content", () => {
    const ctx = context();
    const firstPage = ctx.pages[0];
    if (!firstPage) throw new Error("Test fixture missing home page");
    firstPage.sections[0]!.heading = "Lorem ipsum";
    const duplicate = { ...firstPage, id: "duplicate", slug: "/" } as AgentContext["pages"][number];
    ctx.pages.push(duplicate);

    const result = compileAutonomousEngineering(ctx, "audit the whole site", true, 8);

    expect(result.findings.some((finding) => /placeholder/i.test(finding.message))).toBe(true);
    expect(result.findings.some((finding) => /duplicate page slug/i.test(finding.message))).toBe(true);
  });
});
