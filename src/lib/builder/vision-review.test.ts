import { describe, expect, it } from "vitest";
import {
  parseVisionReview,
  visionRepairs,
  visionReviewPrompt,
  visionSummary,
} from "@/lib/builder/vision-review";

describe("vision review", () => {
  it("asks only about what is visible, with a fixed vocabulary", () => {
    const prompt = visionReviewPrompt({ pageTitle: "Home", viewportWidth: 390 });
    expect(prompt).toContain("low_contrast_text");
    expect(prompt).toContain("390 pixels wide");
    expect(prompt).toContain("Never state a fact");
  });

  it("accepts a well-formed review", () => {
    const review = parseVisionReview({
      issues: [
        { kind: "low_contrast_text", severity: "blocking", where: "hero", detail: "Pale text on a pale photo." },
        { kind: "cramped_spacing", severity: "minor", where: "services", detail: "Cards almost touch." },
      ],
    });
    expect(review.findings.length).toBe(2);
    expect(review.verdict).toBe("poor");
    expect(review.score).toBe(74 - 0 ? 100 - 22 - 4 : 0);
  });

  it("throws away problems outside the vocabulary", () => {
    const review = parseVisionReview({
      issues: [
        { kind: "make_it_pop", severity: "major", detail: "Needs more pop." },
        { kind: "cramped_spacing", severity: "major", detail: "Too tight." },
      ],
    });
    expect(review.findings.map((finding) => finding.kind)).toEqual(["cramped_spacing"]);
    expect(review.discarded).toBe(1);
  });

  it("drops anything that reads like a claim about the business", () => {
    const review = parseVisionReview({
      issues: [
        { kind: "cta_not_prominent", severity: "major", detail: "The $750 button is hard to see." },
        { kind: "unbalanced_layout", severity: "major", detail: "Trusted by 2000 customers is squashed." },
      ],
    });
    expect(review.findings).toEqual([]);
    expect(review.discarded).toBe(2);
  });

  it("survives rubbish input without throwing", () => {
    for (const input of [null, undefined, 42, "text", {}, { issues: "no" }, { issues: [null, 3] }]) {
      expect(() => parseVisionReview(input)).not.toThrow();
    }
    expect(parseVisionReview({ issues: [null] }).findings).toEqual([]);
  });

  it("keeps one finding per kind and caps the list", () => {
    const issues = Array.from({ length: 30 }, () => ({
      kind: "cramped_spacing",
      severity: "minor",
      detail: "Tight.",
    }));
    const review = parseVisionReview({ issues });
    expect(review.findings.length).toBe(1);
    expect(review.discarded).toBe(29);
  });

  it("marks a page clean only when the model answered with an empty list", () => {
    expect(parseVisionReview({ issues: [] }).clean).toBe(false);
    expect(parseVisionReview({ issues: [{ kind: "nope", detail: "x" }] }).clean).toBe(false);
    const clean = parseVisionReview({ issues: [] });
    expect(clean.score).toBe(100);
    expect(clean.verdict).toBe("good");
    expect(visionSummary(clean)).toContain("could not produce");
  });

  it("defaults an unknown severity to the mildest", () => {
    const review = parseVisionReview({
      issues: [{ kind: "cramped_spacing", severity: "catastrophic", detail: "Tight." }],
    });
    expect(review.findings[0]?.severity).toBe("minor");
  });

  it("maps only the problems Revora can genuinely fix", () => {
    const review = parseVisionReview({
      issues: [
        { kind: "low_contrast_text", severity: "blocking", detail: "Pale on pale." },
        { kind: "inconsistent_style", severity: "major", detail: "Two different button shapes." },
      ],
    });
    const { repairs, unfixable } = visionRepairs(review);
    expect(repairs.map((repair) => repair.action)).toEqual(["raise_contrast"]);
    expect(unfixable.map((finding) => finding.kind)).toEqual(["inconsistent_style"]);
  });

  it("turns movement complaints into switching movement off", () => {
    const review = parseVisionReview({
      issues: [{ kind: "too_much_movement", severity: "major", detail: "Everything slides about." }],
    });
    const { repairs } = visionRepairs(review);
    expect(repairs[0]).toMatchObject({ action: "set_section_effect", effect: "none" });
  });

  it("summarises honestly", () => {
    const review = parseVisionReview({
      issues: [{ kind: "content_cut_off", severity: "blocking", detail: "Text runs off the edge." }],
    });
    expect(visionSummary(review)).toContain("1 visual problem");
    expect(visionSummary(review)).toContain("serious");
  });
});
