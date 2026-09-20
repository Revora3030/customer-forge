import { describe, expect, it } from "vitest";
import { applySummary, skippedReasons } from "./apply-report";

describe("explaining a partly applied plan", () => {
  it("says nothing when every update landed", () => {
    expect(applySummary({ applied: 12, failed: 0, stale: 0, details: [] })).toBe("");
  });

  it("names the real reason and how to continue", () => {
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
    expect(summary).toContain("42 of 60 updates reached your website");
    expect(summary).toContain("never created");
    expect(summary).toContain("Ask for the same change again");
  });

  it("stays honest when the reason is not recognisable", () => {
    const summary = applySummary({
      applied: 3,
      failed: 1,
      stale: 0,
      details: ["skipped set_component:something_new"],
    });
    expect(summary).toContain("3 of 4 updates");
    expect(summary).toContain("nothing was left half-finished");
    expect(summary).not.toContain("because");
  });

  it("describes removed targets without repeating itself", () => {
    expect(
      skippedReasons([
        "stale set_component (component removed)",
        "stale set_component (component removed)",
        "stale set_section (section removed)",
      ]),
    ).toEqual(["an item on the page had been removed", "a section had been removed"]);
  });
});
