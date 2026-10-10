import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("form panels follow the customer site's own colours", () => {
  it("panel reads the raw --card/--border tokens a site theme overrides", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const panel = css.slice(css.indexOf("@utility panel {"), css.indexOf("@utility panel-inset"));
    // --color-card resolves at :root to Revora's dark app colour and is
    // inherited, so a site's light --card never reached its forms.
    expect(panel).toContain("var(--card)");
    expect(panel).not.toContain("var(--color-card)");
    expect(panel).toContain("var(--border)");
  });
});
