import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The palette Save writes business_profiles colours, which the public site
// reads live (public_business_profiles view), so the editor must say so.
describe("PreviewThemeEditor live-site note", () => {
  const source = readFileSync("src/components/app/PreviewThemeEditor.tsx", "utf8");

  it("tells the owner a save updates the live site, right above the Save button", () => {
    const note = source.indexOf("This updates your live site.");
    const save = source.indexOf('data-testid="preview-theme-save"');
    expect(note).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(note);
  });
});
