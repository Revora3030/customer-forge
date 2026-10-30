import { describe, expect, it } from "vitest";
import { chapterLabels, packageScope } from "./service-packages";
import { packageBookHref } from "@/components/site/live-blocks-utils";

describe("package scope for every trade", () => {
  it("uses the trade's own steps, not a detailing script, for other businesses", () => {
    expect(packageScope("Raleigh plumbing")).toEqual(["Find what is wrong", "Repair it without a mess", "Confirm it holds"]);
    expect(packageScope("Family dental studio")).toEqual(["Welcome and examination", "The agreed treatment", "Your next visit planned"]);
    expect(packageScope("Physiotherapy clinic")).toEqual(["Consultation first", "The agreed treatment", "Aftercare you can follow"]);
    expect(packageScope("Mobile auto detailing").join(" ")).not.toMatch(/dental|roof/i);
  });

  it("still has a scope for a business that matches no trade", () => {
    expect(packageScope("Obscure widget cooperative")).toEqual(["What is included", "How the visit works", "What happens next"]);
    expect(chapterLabels("Obscure widget cooperative").length).toBeGreaterThan(0);
  });

  it("points a package button at the booking form with that service selected", () => {
    expect(packageBookHref("/draft/elite", "svc-1")).toBe("/draft/elite#book-svc-1");
    expect(packageBookHref("/s/elite#old", "a b")).toBe("/s/elite#book-a%20b");
  });

  it("does not put a price in the scope lines", () => {
    for (const industry of ["plumbing", "roofing", "law", "restaurant", "hvac", "med spa", "saas"]) {
      expect(packageScope(industry).join(" ")).not.toMatch(/\$|price/i);
    }
  });
});
