import { describe, expect, it } from "vitest";
import { architectureShortfall, canonicalSlug, normalizePageArchitecture } from "./ai-page-architecture";
import type { PageArchitecture } from "./creative-authority";

const candidate: PageArchitecture[] = [
  { slug: "home", title: "Home", purpose: "home", primaryAction: "Call", sections: [{ role: "hero" }, { role: "contact" }] } as unknown as PageArchitecture,
];

describe("page plan addresses", () => {
  it("treats the usual names for the home page as the home page", () => {
    for (const raw of ["/", "index", "Homepage", "/home/", ""]) expect(canonicalSlug(raw, "home")).toBe("home");
    expect(canonicalSlug("/Services/", "home")).toBe("services");
  });

  it("accepts a plan whose home page is called index", () => {
    const result = normalizePageArchitecture({
      proposal: [{ slug: "index", title: "Home", sections: [{ role: "hero", heading: "Mobile detailing in Durham" }, { role: "contact", heading: "Book a detail" }] }] as never,
      candidate,
      thinFacts: true,
    });
    expect(result?.architecture[0]?.slug).toBe("home");
  });

  it("explains a plan with no home page", () => {
    expect(architectureShortfall({ proposal: [{ slug: "about", sections: [] }] as never, candidate })).toContain('slug "home"');
  });
});
