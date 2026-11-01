import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isCapacitySkip, scaffoldRequiredCopy, SCAFFOLD_CTA, wordingCapacityHit, type ScaffoldFacts } from "./copy-scaffold";
import type { SiteCopy } from "@/lib/site-engine";

const facts: ScaffoldFacts = {
  businessName: "Ridge Line Roofing",
  description: "Family-run roof repair and replacement. We also clean gutters.",
  city: "Asheville",
  state: "NC",
  serviceArea: null,
  services: [{ name: "Roof repair" }, { name: "Roof replacement" }, { name: "Gutter cleaning" }, { name: "Skylights" }],
};
const blank = () => ({ heroHeadline: "", heroSubheadline: "", primaryCta: "", metaTitle: "", metaDescription: "" }) as unknown as SiteCopy;
const PRICE_OR_RATING = /[$£€]\s?\d|\d+(\.\d)?\s?(stars?|★)|\b\d{2,3}%|reviews?\b|rated\b|best\b|#1\b|award/i;

describe("isCapacitySkip / wordingCapacityHit", () => {
  it.each([
    "credits_exhausted", "402 Payment Required", "rate_limited", "429 Too Many Requests", "timeout", "timed out",
    "provider_unavailable", "no_tier_available", "budget_exhausted", "model overloaded", "quota exceeded",
  ])("treats %s as capacity", (reason) => expect(isCapacitySkip(reason)).toBe(true));
  it.each([null, "", "did not return the agreed shape", "refused by the fact check", "bad_response", "malformed answer (unavailable)"])(
    "does not treat %s as capacity", (reason) => expect(isCapacitySkip(reason)).toBe(false),
  );
  it("needs every skipped wording pass to be a capacity skip", () => {
    expect(wordingCapacityHit([
      { purpose: "content_strategy", used: false, skipped: "credits_exhausted" },
      { purpose: "metadata", used: false, skipped: "rate_limited" },
    ])).toBe(true);
    expect(wordingCapacityHit([
      { purpose: "content_strategy", used: false, skipped: "credits_exhausted" },
      { purpose: "metadata", used: false, skipped: "did not return the agreed shape" },
    ])).toBe(false);
  });
  it("ignores non-wording passes and used passes", () => {
    expect(wordingCapacityHit([{ purpose: "picture_campaign", used: false, skipped: "credits_exhausted" }])).toBe(false);
    expect(wordingCapacityHit([{ purpose: "content_strategy", used: true, skipped: null }])).toBe(false);
    expect(wordingCapacityHit([])).toBe(false);
  });
});

describe("scaffoldRequiredCopy", () => {
  it("fills blank required fields only from facts", () => {
    const { copy, filled } = scaffoldRequiredCopy(blank(), facts);
    expect(filled).toEqual(["heroHeadline", "heroSubheadline", "primaryCta", "metaTitle", "metaDescription"]);
    expect(copy.heroHeadline).toBe("Ridge Line Roofing");
    expect(copy.heroSubheadline).toBe("Family-run roof repair and replacement.");
    expect(copy.primaryCta).toBe(SCAFFOLD_CTA);
    expect(copy.metaTitle).toBe("Ridge Line Roofing | Asheville");
    expect(copy.metaDescription).toBe(facts.description);
  });
  it("never overwrites AI wording", () => {
    const { copy, filled } = scaffoldRequiredCopy({ ...blank(), heroHeadline: "Roofs that last", primaryCta: "Book a visit" }, facts);
    expect(copy.heroHeadline).toBe("Roofs that last");
    expect(copy.primaryCta).toBe("Book a visit");
    expect(filled).not.toContain("heroHeadline");
  });
  it("uses services and place when there is no description", () => {
    const { copy } = scaffoldRequiredCopy(blank(), { ...facts, description: null, serviceArea: "Buncombe County" });
    expect(copy.heroSubheadline).toBe("Roof repair, Roof replacement and Gutter cleaning in Buncombe County");
    expect(copy.metaDescription).toBe("Ridge Line Roofing: Roof repair, Roof replacement and Gutter cleaning in Buncombe County.");
  });
  it("uses the owner's action label when set", () => {
    expect(scaffoldRequiredCopy(blank(), { ...facts, ctaLabel: "Request an inspection" }).copy.primaryCta).toBe("Request an inspection");
  });
  it("leaves a field blank when there is no fact for it", () => {
    const { copy, filled } = scaffoldRequiredCopy(blank(), { businessName: null, description: null, city: null, state: null, serviceArea: null, services: [] });
    expect(filled).toEqual(["primaryCta"]);
    expect(copy.heroHeadline).toBe("");
  });
  it("respects length limits", () => {
    const long = "word ".repeat(80);
    const { copy } = scaffoldRequiredCopy(blank(), { ...facts, businessName: "A".repeat(50), description: long });
    expect(copy.metaTitle.length).toBeLessThanOrEqual(60);
    expect(copy.metaDescription.length).toBeLessThanOrEqual(155);
    expect(copy.heroSubheadline.length).toBeLessThanOrEqual(200);
  });
  it("invents no prices, ratings or reviews and is deterministic", () => {
    const a = scaffoldRequiredCopy(blank(), { ...facts, description: null });
    expect(JSON.stringify(a.copy)).not.toMatch(PRICE_OR_RATING);
    expect(scaffoldRequiredCopy(blank(), { ...facts, description: null })).toEqual(a);
  });
});

describe("worker wiring", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
  it("only scaffolds after the creative direction was authored and the wording team hit capacity", () => {
    expect(worker).toMatch(/refined\.creativeChanged && wordingCapacityHit\(refined\.passes\)/);
    expect(worker).toMatch(/missingAiCopy\(scaffold\.copy\)\.length === 0/);
    expect(worker).toMatch(/degradeCopyScaffold\(\{ fields: copyScaffoldFields \}\)/);
  });
  it("still raises the retryable error otherwise", () => {
    expect(worker).toMatch(/throw new AiStepUnavailableError\(\s*"website wording"/);
  });
});
