import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("keyboard accessibility guards (A11Y-1)", () => {
  it("every Revora page starts with a skip link, and customer sites are left alone", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('import { SkipLink } from "@/components/marketing/SkipLink"');
    expect(root).toContain("{!clientSite && <SkipLink />}");
    const skip = read("src/components/marketing/SkipLink.tsx");
    expect(skip).toContain('href="#main-content"');
    expect(skip).toContain("Skip to main content");
  });

  it("scrolling to a focused control keeps it clear of the sticky header and cookie notice", () => {
    const css = read("src/styles.css");
    expect(css).toMatch(/scroll-padding-top:\s*6rem/);
    expect(css).toMatch(/scroll-padding-bottom:\s*14rem/);
  });

  it("the dictate button's accessible name is its visible text, so voice-control users can say it", () => {
    const button = read("src/components/marketing/VoiceDictateButton.tsx");
    expect(button).not.toMatch(/aria-label=/);
    expect(button).toContain("aria-describedby={hintId}");
  });
});
