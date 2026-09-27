import { describe, expect, it } from "vitest";
import { detectGenericPhrases, detectRepeatedFiller, genericityIssues, scoreGenericity } from "./genericity";

describe("detectGenericPhrases", () => {
  it("finds no hits in plain, specific copy", () => {
    expect(detectGenericPhrases(["We re-roof homes in Round Rock, Texas.", "Call (512) 555-0100."])).toEqual([]);
  });

  it("finds a stock phrase, case-insensitively, and counts repeats", () => {
    const hits = detectGenericPhrases([
      "Welcome to our website!",
      "Read more: WELCOME TO OUR WEBSITE",
      "We are dedicated to providing top service.",
    ]);
    expect(hits).toContainEqual({ phrase: "welcome to our website", count: 2 });
    expect(hits).toContainEqual({ phrase: "we are dedicated to providing", count: 1 });
  });

  it("ignores non-string and empty values instead of throwing", () => {
    expect(detectGenericPhrases([null, undefined, {}, 42, "  "])).toEqual([]);
  });
});

describe("detectRepeatedFiller", () => {
  it("does not flag short, legitimately-repeated strings like a CTA label", () => {
    expect(detectRepeatedFiller(["Book now", "Book now", "Book now", "Book now"])).toEqual([]);
  });

  it("flags a long block copy-pasted three or more times", () => {
    const block =
      "We provide fast, reliable, affordable service to every customer in the area, every single time.";
    const hits = detectRepeatedFiller([block, block, block, "unrelated short line"]);
    expect(hits).toEqual([{ phrase: block.toLowerCase(), count: 3 }]);
  });

  it("does not flag a long block seen only once or twice", () => {
    const block = "A".repeat(50);
    expect(detectRepeatedFiller([block, block])).toEqual([]);
  });
});

describe("scoreGenericity", () => {
  it("scores clean, specific copy at 100", () => {
    expect(scoreGenericity(["We install standing-seam metal roofs in Austin."]).score).toBe(100);
  });

  it("lowers the score for each stock phrase and repeated block found", () => {
    const report = scoreGenericity(["Welcome to our website", "Look no further for quality you can trust"]);
    expect(report.score).toBeLessThan(100);
  });

  it("never goes below zero", () => {
    const spam = Array(50).fill("welcome to our website, your one-stop shop, look no further");
    expect(scoreGenericity(spam).score).toBe(0);
  });
});

describe("genericityIssues", () => {
  it("detects generic fixture-style headline phrasing", () => {
    const hits = detectGenericPhrases([
      "Choose your detail with clarity.",
      "Detailing, without the guesswork.",
      "A straightforward way to choose.",
    ]);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("returns no issues for specific, non-repeated copy", () => {
    expect(genericityIssues(["We've re-roofed 400+ homes in the Austin metro since 2011."])).toEqual([]);
  });

  it("returns an advice-severity issue for stock phrases, never a blocker", () => {
    const issues = genericityIssues(["Welcome to our website", "We are committed to providing excellence"]);
    expect(issues.length).toBeGreaterThan(0);
    for (const found of issues) expect(found.severity).toBe("advice");
  });

  it("labels the repeated-filler issue distinctly from the stock-phrase issue", () => {
    const block = "Our team is here to help you with anything you need, day or night, rain or shine.";
    const issues = genericityIssues([block, block, block]);
    expect(issues.map((i) => i.key)).toContain("repeated_filler_copy");
  });
});
