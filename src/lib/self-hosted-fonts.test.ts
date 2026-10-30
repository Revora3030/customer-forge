import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("platform fonts are self-hosted (Phase A item 11)", () => {
  it("imports DM Sans, Instrument Serif and Space Grotesk from Fontsource", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain('@import "@fontsource/dm-sans/latin-400.css"');
    expect(css).toContain('@import "@fontsource/instrument-serif/latin-400.css"');
    expect(css).toContain('@import "@fontsource/space-grotesk/latin-700.css"');
  });
  it("the platform root no longer loads Google Fonts", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).not.toContain("fonts.googleapis.com/css2");
    expect(root).not.toContain('href: "https://fonts.gstatic.com"');
  });
});
