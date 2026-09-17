import { describe, expect, it } from "vitest";
import { analyseIntent } from "./intent-intelligence";

describe("analyseIntent", () => {
  it("preserves multi-step order", () => {
    const result = analyseIntent("change the hero, remove the old CTA, then add booking, then fix mobile");
    expect(result.safe).toBe(true);
    expect(result.operations.map((operation) => operation.raw)).toEqual([
      "change the hero",
      "remove the old CTA",
      "add booking",
      "fix mobile",
    ]);
    expect(result.instruction).toContain("change the hero then remove the old CTA then add booking then fix mobile");
  });

  it("deduplicates repeated equivalent clauses", () => {
    const result = analyseIntent("make the hero premium and make the hero premium");
    expect(result.safe).toBe(true);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.operations).toHaveLength(1);
  });

  it("blocks a same-subject add/remove contradiction", () => {
    const result = analyseIntent("remove the pricing section and add the pricing section");
    expect(result.safe).toBe(false);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("allows an explicit follow-up when prior context exists", () => {
    const result = analyseIntent("make it more premium", ["Make the homepage modern"], "homepage");
    expect(result.safe).toBe(true);
    expect(result.followUpUsed).toBe(true);
  });

  it("asks instead of guessing an unresolved follow-up", () => {
    const result = analyseIntent("make it better");
    expect(result.safe).toBe(false);
    expect(result.ambiguities.join(" ")).toContain("follow-up reference");
  });

  it("returns a safe diagnostic for an empty request", () => {
    const result = analyseIntent("");
    expect(result.safe).toBe(true);
    expect(result.operations).toHaveLength(0);
  });
});
