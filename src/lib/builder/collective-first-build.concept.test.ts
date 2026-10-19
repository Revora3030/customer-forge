import { describe, expect, it } from "vitest";
import { missingConcept } from "./collective-first-build.server";
import { blankCreativeBrief } from "./first-build-contract";

describe("missingConcept", () => {
  it("flags a brief with no visual concept and passes one that has it", () => {
    const brief = blankCreativeBrief([]);
    expect(missingConcept(brief)).toEqual(["concept"]);
    brief.concept = "Showroom gloss at the customer's curb";
    expect(missingConcept(brief)).toEqual([]);
  });
});
