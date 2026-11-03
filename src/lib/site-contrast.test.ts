import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/readable-color";
import { aaTextOn, enforceThemeAa, minContrast, themeContrastIssues } from "@/lib/site-contrast";
import { siteThemeStyle } from "@/lib/site-theme";

/** A deterministic sweep of brand palettes: greys, pale and mid-tone brands, dark and light surfaces. */
function palettes(): { primaryColor: string | null; secondaryColor: string | null; accentColor: string | null }[] {
  const steps = ["00", "33", "66", "80", "99", "aa", "cc", "ee", "ff"];
  const colours: string[] = [];
  for (const r of steps) for (const g of ["00", "80", "cc", "ff"]) for (const b of ["00", "77", "ff"]) colours.push(`#${r}${g}${b}`);
  const surfaces = [null, "#ffffff", "#000000", "#f5efe6", "#0c0e12", "#c0c0c0", "#7a8ca0", "#1d3b2a", "#ffeeaa"];
  const list: { primaryColor: string | null; secondaryColor: string | null; accentColor: string | null }[] = [];
  colours.forEach((primary, i) => {
    for (const surface of surfaces) list.push({ primaryColor: primary, secondaryColor: surface, accentColor: colours[(i * 7 + 3) % colours.length] ?? null });
  });
  list.push({ primaryColor: null, secondaryColor: null, accentColor: null });
  return list;
}

describe("WCAG AA contrast on site themes", () => {
  it("every theme text colour clears 4.5:1 on every surface it sits on, across a palette sweep", () => {
    const failures: string[] = [];
    for (const palette of palettes()) {
      const vars = siteThemeStyle(palette) as Record<string, string>;
      for (const issue of themeContrastIssues(vars)) failures.push(`${JSON.stringify(palette)} ${issue.text} on ${issue.surface}: ${issue.ratio}`);
    }
    expect(failures).toEqual([]);
  });

  it("aaTextOn keeps a passing colour and fixes a failing one on all surfaces at once", () => {
    expect(aaTextOn("#101114", ["#ffffff"])).toBe("#101114");
    const fixed = aaTextOn("#9a9a9a", ["#ffffff", "#f1f1f1", "#e6e6e6"]);
    expect(minContrast(fixed, ["#ffffff", "#f1f1f1", "#e6e6e6"])).toBeGreaterThanOrEqual(4.5);
    // A pale yellow brand on white stays a (dark) yellow-ish hue rather than becoming black.
    const gold = aaTextOn("#f5c518", ["#ffffff"]);
    expect(contrastRatio(gold, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(gold).not.toBe("#000000");
    // Large display text needs only 3:1.
    const large = aaTextOn("#999999", ["#ffffff"], { large: true });
    expect(contrastRatio(large, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("leaves unmeasurable values alone", () => {
    expect(aaTextOn("var(--x)", ["#ffffff"])).toBe("var(--x)");
    expect(aaTextOn("#777777", ["color-mix(in oklab, red 20%, blue)"])).toBe("#777777");
  });

  it("themeContrastIssues reports failing pairs and enforceThemeAa clears them", () => {
    const vars = { "--background": "#ffffff", "--foreground": "#bbbbbb", "--card": "#f4f4f4", "--muted-foreground": "#cccccc", "--muted": "#eeeeee", "--primary": "#ffcc00", "--primary-foreground": "#ffffff", color: "#bbbbbb" };
    const before = themeContrastIssues(vars);
    expect(before.map((issue) => `${issue.text}@${issue.surface}`)).toEqual(expect.arrayContaining(["--foreground@--background", "--muted-foreground@--muted", "--primary-foreground@--primary"]));
    const after = enforceThemeAa(vars);
    expect(themeContrastIssues(after)).toEqual([]);
    expect(after.color).toBe(after["--foreground"]);
    expect(after["--background"]).toBe("#ffffff");
  });
});
