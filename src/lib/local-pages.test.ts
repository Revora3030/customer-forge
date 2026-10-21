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
