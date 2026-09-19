import { describe, expect, it } from "vitest";
import { compileWholeRepoUpgrades } from "./whole-repo-upgrade";

const context = {
  business: {
    name: "Acme Services",
    industry: "home services",
    tagline: "",
    description: "",
    city: "Chapel Hill",
    state: "NC",
    serviceArea: "Chapel Hill",
    phone: "",
    email: "",
    services: [],
    publishedReviewCount: 0,
  },
  pages: [
    {
      id: "home",
      title: "Home",
      slug: "/",
      kind: "home",
      sections: [
        {
          id: "hero",
          kind: "hero",
          visible: true,
          heading: "",
          subheading: "",
          body: "",
          components: [],
          sort_order: 0,
        },
      ],
    },
  ],
  pageKinds: ["home", "custom"],
  sectionKinds: ["hero", "cta"],
} as never;

describe("whole-repo upgrade layer", () => {
  it("finds empty lead content without inventing facts", () => {
    const result = compileWholeRepoUpgrades(context, "improve the site", 60);
    expect(result.findings.some((finding) => finding.area === "content")).toBe(true);
    expect(result.actions.every((action) => action.type !== "set_page")).toBe(true);
  });

  it("separates runtime evidence from static planning", () => {
    const result = compileWholeRepoUpgrades(
      context,
      "make it faster, more responsive and visually polished",
      60,
    );
    expect(result.runtimeRequired).toEqual(
      expect.arrayContaining([
        "rendered mobile viewport verification",
        "real-browser Core Web Vitals measurement",
        "visual screenshot comparison",
      ]),
    );
  });

  it("never exceeds the supplied action cap", () => {
    const result = compileWholeRepoUpgrades(context, "improve everything", 0);
    expect(result.actions).toHaveLength(0);
  });
});
