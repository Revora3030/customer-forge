import { describe, expect, it } from "vitest";
import { categoryValueProps, screenClaims } from "./business-dna";

const noFacts = {};
describe("category-standard value props", () => {
  it.each(["Plumbing", "Roofing", "Dentist", "Personal injury law firm", "Mystery business"])("%s gets props that pass the claim screen", (industry) => {
    const props = categoryValueProps(industry);
    expect(props.length).toBeGreaterThan(3);
    for (const p of props) {
      expect(screenClaims(p, noFacts)).toEqual([]);
      expect(p).not.toMatch(/\d/);
    }
  });

  it("still blocks specific invented claims", () => {
    expect(screenClaims("Satisfaction guaranteed", noFacts)[0]?.reason).toBe("guarantee");
    expect(screenClaims("The leading roofer in town", noFacts)[0]?.reason).toBe("superlative claim");
    expect(screenClaims("Licensed and insured", noFacts)[0]?.reason).toBe("credential");
    expect(screenClaims("98% of customers", noFacts)[0]?.reason).toBe("statistic");
  });

  it("lets non-claim wording through", () => {
    expect(screenClaims("Leading you through every step of the job", noFacts)).toEqual([]);
    expect(screenClaims("Shingles carry the manufacturer's warranty", noFacts)).toEqual([]);
  });
});
