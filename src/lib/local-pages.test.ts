import { describe, expect, it } from "vitest";
import { localPageContent, localPaths, LOCAL_INDUSTRIES } from "./local-pages";
import { US_STATES } from "./us-states";

describe("local landing pages", () => {
  it("Alabama HVAC page names the cities people search for", () => {
    const page = localPageContent("hvac", "alabama")!;
    for (const city of ["Birmingham", "Montgomery", "Huntsville"]) {
      expect(page.description).toContain(city);
      expect(page.heading).toContain(city);
    }
  });

  it("shows the real price: $350 setup, first month free, then $100/month", () => {
    const page = localPageContent("hvac", "alabama")!;
    expect(page.description).toContain("$350");
    expect(page.description).toContain("$100/mo");
    expect(page.intro).toContain("first month free");
    expect(page.intro).toContain("3 days");
  });

  it("every industry × state page has its own title and description", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    let count = 0;
    for (const industry of LOCAL_INDUSTRIES) {
      for (const state of US_STATES) {
        const page = localPageContent(industry.slug, state.slug)!;
        titles.add(page.title);
        descriptions.add(page.description);
        count++;
      }
    }
    expect(titles.size).toBe(count);
    expect(descriptions.size).toBe(count);
    expect(localPaths().length).toBeGreaterThan(count);
  });
});

import { localDescription, localTitle } from "./local-pages";
describe("localTitle", () => {
  it("leads with website design and the brand, never 'Lead Generation <State>:'", () => {
    expect(localTitle("HVAC", "Georgia")).toBe("HVAC Website Design in Georgia | Revora Growth Systems");
  });
  it("falls back to the short brand when the long one does not fit", () => {
    expect(localTitle("Landscaping", "Massachusetts")).toBe("Landscaping Website Design in Massachusetts | Revora");
  });
  it("names the three searched cities on Alabama HVAC", () => {
    const page = localPageContent("hvac", "alabama");
    expect(page?.title).toBe("HVAC Lead Generation in Montgomery, Huntsville & Birmingham");
    expect(page?.heading).toContain("Montgomery, Huntsville, Birmingham");
  });
});

describe("local page titles and descriptions", () => {
  it("keep every title within 60 characters and every description a complete 90-160 character text", () => {
    for (const path of localPaths()) {
      const [, , industry, state] = path.split("/");
      if (!industry || !state) continue; // hub pages, not industry x state pages
      const page = localPageContent(industry, state)!;
      expect(page.title.length, page.title).toBeLessThanOrEqual(60);
      if (path !== "/local/hvac/alabama") expect(page.title).toContain("Revora");
      expect(page.title).not.toContain("Lead Generation Alabama:");
      expect(page.description.length, page.description).toBeLessThanOrEqual(160);
      expect(page.description.length, page.description).toBeGreaterThanOrEqual(90);
      expect(page.description).toMatch(/[.!]$/);
      expect(page.intro).not.toMatch(/\ba (auto|[aeiou])/i);
    }
  });
  it("describes with the real cities", () => {
    expect(localDescription("HVAC", "Alabama", ["Montgomery", "Huntsville", "Birmingham"])).toContain("Montgomery, Huntsville and Birmingham");
  });
});
