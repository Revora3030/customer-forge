import { describe, expect, it } from "vitest";
import { isThinFactSheet } from "@/lib/builder/ai-page-architecture.server";

describe("isThinFactSheet", () => {
  it("treats a one-line demo with no services as thin", () => {
    expect(isThinFactSheet({ services: [], description: "Auto detailing serving Durham, NC." })).toBe(true);
  });
  it("does not treat a business with services as thin", () => {
    expect(isThinFactSheet({ services: ["Interior detail"], description: null })).toBe(false);
  });
});

import { normalizePageArchitecture } from "@/lib/builder/ai-page-architecture";

describe("thin-fact single page", () => {
  const candidate = ["home", "about", "contact"].map((slug) => ({ slug, title: slug, purpose: slug, primaryAction: "Call", sections: [{ role: "hero" }, { role: "contact" }] })) as never;
  const proposal = [{ slug: "home", title: "Home", sections: [{ role: "hero", heading: "Auto detailing in Durham" }, { role: "contact", heading: "Call us" }] }] as never;
  it("allows one page only when facts are thin", () => {
    expect(normalizePageArchitecture({ proposal, candidate, thinFacts: true })).not.toBeNull();
    expect(normalizePageArchitecture({ proposal, candidate })).toBeNull();
  });
});
