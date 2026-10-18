import { describe, expect, it } from "vitest";
import { applyHeadline, applySummary, skippedLine, skippedReasons } from "./apply-report";

describe("explaining a partly applied plan", () => {
  it("says nothing when every update landed", () => {
    expect(applySummary({ applied: 12, failed: 0, stale: 0, details: [] })).toBe("");
  });

  it("names the real reason, and only ever talks about the draft", () => {
    const summary = applySummary({
      applied: 42,
      failed: 18,
      stale: 0,
      details: [
        "applied set_theme",
        "skipped set_section_effect:unresolved_section",
        "skipped set_section:unresolved_section",
      ],
    });
    expect(summary).toContain("Updated your draft · 42 changes");
    expect(summary).toContain("18 changes didn't go through — ");
    expect(summary).toContain("never created");
    expect(summary).not.toContain("reached your website");
    expect(summary).not.toContain("Ask for the same change again");
  });

  it("stays honest when the reason is not recognisable", () => {
    const summary = applySummary({
      applied: 3,
      failed: 1,
      stale: 0,
      details: ["skipped set_component:something_new"],
    });
    expect(summary).toContain("Updated your draft · 3 changes");
    expect(summary).toContain("1 change didn't go through. Nothing else was touched.");
    expect(summary).not.toContain("because");
    expect(summary).not.toContain("nothing was left half-finished");
  });

  it("never reports an update when nothing was written", () => {
    const summary = applySummary({ applied: 0, failed: 2, stale: 0, details: [] });
    expect(summary).not.toContain("Updated your draft");
    expect(summary).toBe("2 changes didn't go through. Nothing else was touched.");
  });

  it("maps the real stale labels the apply step writes", () => {
    expect(skippedReasons(["stale set_component (missing_component)"])).toEqual([
      "those parts of your page had changed since I planned them",
    ]);
    expect(skippedReasons(["stale set_section (missing_section)", "stale add_page (missing_page)"])).toEqual([
      "those parts of your page had changed since I planned them",
    ]);
  });

  it("still understands the older removed-target labels, without repeating itself", () => {
    expect(
      skippedReasons([
        "stale set_component (component removed)",
        "stale set_component (component removed)",
        "stale set_section (section removed)",
      ]),
    ).toEqual(["those parts of your page had changed since I planned them"]);
  });

  it("builds the card lines from stored counts", () => {
    expect(applyHeadline(1)).toBe("Updated your draft · 1 change");
    expect(skippedLine(0)).toBe("");
    expect(skippedLine(2, ["those parts of your page had changed since I planned them"])).toBe(
      "2 changes didn't go through — those parts of your page had changed since I planned them.",
    );
  });
});
