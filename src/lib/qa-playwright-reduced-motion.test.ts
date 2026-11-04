import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shared QA Playwright config", () => {
  it("captures with reduced motion so reveal sections are visible", () => {
    const config = readFileSync(new URL("../../e2e/playwright.config.ts", import.meta.url), "utf8");
    const use = config.slice(config.indexOf("use: {"), config.indexOf("projects:"));
    expect(use).toMatch(/reducedMotion:\s*"reduce"/);
  });
});
