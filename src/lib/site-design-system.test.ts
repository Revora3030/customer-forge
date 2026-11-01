import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/readable-color";
import { AA_TEXT, PALETTE_PRESETS } from "@/lib/builder/palette-edit";
import { cleanHex, hexToHsl, hslToHex, mixHex, onColour, rampTextContrast, tintedNeutralRamp } from "@/lib/site-palette-ramp";
import { premiumSurface, siteThemeStyle } from "@/lib/site-theme";
import { FONT_PAIRINGS } from "@/lib/site-font-pairings";
import {
  MOTION_TOKENS,
  REDUCED_MOTION_TOKENS,
  SPACE_SCALE,
  TYPE_RAMP,
  TYPE_VOICES,
  designSystemCss,
  designSystemVars,
  familyCount,
  typeVoiceFor,
} from "@/lib/site-design-system";

const BRANDS = ["#1d4ed8", "#166534", "#b91c1c", "#7e22ce", "#f5c518", "#0ea5e9", "#c2410c", "#334155", "#be185d", "#14b8a6"];

describe("tinted neutral ramp", () => {
  it("clears AA for text and muted text on every neutral, light and dark, for many brands", () => {
    for (const brand of BRANDS) {
      for (const surface of [null, "#ffffff", "#f8fafc", "#fffaf5", "#0b1220", "#000000", "#111827"]) {
        const ramp = tintedNeutralRamp({ primary: brand, surface });
        expect(rampTextContrast(ramp, "text"), `${brand} on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(rampTextContrast(ramp, "textMuted"), `${brand} muted on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it("tints pure white and pure black toward the brand hue instead of painting stark blocks", () => {
    const light = tintedNeutralRamp({ primary: "#1d4ed8", surface: "#ffffff" });
    expect(light.background).not.toBe("#ffffff");
    expect(hexToHsl(light.background).l).toBeGreaterThan(0.96);
    expect(Math.abs(hexToHsl(light.background).h - hexToHsl("#1d4ed8").h)).toBeLessThan(25);
    expect(hexToHsl(light.background).s).toBeGreaterThan(0.02);
    const dark = tintedNeutralRamp({ primary: "#60a5fa", surface: "#000000" });
    expect(dark.scheme).toBe("dark");
    expect(dark.background).not.toBe("#000000");
    expect(hexToHsl(dark.background).l).toBeLessThan(0.12);
  });

  it("keeps an owner-chosen non-pure surface and the neutral blank state untouched", () => {
    expect(tintedNeutralRamp({ primary: "#1d4ed8", surface: "#fffaf5" }).background).toBe("#fffaf5");
    const blank = tintedNeutralRamp({});
    expect(blank.background).toBe("#ffffff");
    expect(blank.onPrimary).toBeNull();
    // A black or grey brand has no hue to borrow.
    const grey = tintedNeutralRamp({ primary: "#777777", surface: "#ffffff" }).background;
    expect(grey.slice(1, 3)).toBe(grey.slice(3, 5));
    expect(grey.slice(3, 5)).toBe(grey.slice(5, 7));
  });

  it("steps are ordered: alternate band and border sit further from the page than the card", () => {
    const ramp = tintedNeutralRamp({ primary: "#166534", surface: "#ffffff" });
    expect(contrastRatio(ramp.border, ramp.background)!).toBeGreaterThan(1.05);
    expect(contrastRatio(ramp.borderStrong, ramp.background)!).toBeGreaterThan(contrastRatio(ramp.border, ramp.background)!);
    expect(ramp.surfaceAlt).not.toBe(ramp.background);
  });

  it("on-colour text passes AA on every brand and preset primary", () => {
    for (const colour of [...BRANDS, ...PALETTE_PRESETS.map((p) => p.primary)]) {
      expect(contrastRatio(onColour(colour), colour)!, colour).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(tintedNeutralRamp({ primary: colour }).onPrimary!, colour)!, colour).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("colour helpers round-trip", () => {
    expect(cleanHex("#ABC")).toBe("#aabbcc");
    expect(cleanHex("red")).toBeNull();
    expect(hslToHex(...(Object.values(hexToHsl("#1d4ed8")) as [number, number, number]))).toBe("#1d4ed8");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("siteThemeStyle with the ramp", () => {
  const vars = (input: Parameters<typeof siteThemeStyle>[0]) => (siteThemeStyle(input) ?? {}) as Record<string, string>;

  it("keeps primary, secondary and accent columns working", () => {
    const theme = vars({ primaryColor: "#1d4ed8", secondaryColor: "#f8fafc", accentColor: "#0369a1" });
    expect(theme["--primary"]).toBe("#1d4ed8");
    expect(theme["--accent"]).toBe("#0369a1");
    expect(theme["--background"]).toBe(premiumSurface("#f8fafc"));
    expect(theme["--ds-surface-alt"]).toBeTruthy();
    expect(theme["--ds-shadow-rgb"]).toMatch(/^\d+ \d+ \d+$/);
  });

  it("muted copy stays AA on page, card and band surfaces", () => {
    for (const brand of BRANDS) {
      const theme = vars({ primaryColor: brand });
      for (const band of ["--background", "--card", "--muted"]) {
        expect(contrastRatio(theme["--muted-foreground"]!, theme[band]!)!, `${brand} ${band}`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(theme["--foreground"]!, theme[band]!)!, `${brand} ${band}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });
});

describe("type system", () => {
  it("every curated pairing loads at most two families and has a voice", () => {
    for (const pairing of FONT_PAIRINGS) {
      expect(familyCount(`${pairing.display}|${pairing.body}`), pairing.id).toBeLessThanOrEqual(2);
      expect(TYPE_VOICES[pairing.id], pairing.id).toBeDefined();
    }
    expect(familyCount("Fraunces|Fraunces")).toBe(1);
    expect(familyCount("Fraunces")).toBe(1);
    expect(Object.keys(TYPE_VOICES).sort()).toEqual(FONT_PAIRINGS.map((p) => p.id).sort());
  });

  it("voices stay inside readable bounds", () => {
    for (const [id, voice] of Object.entries(TYPE_VOICES)) {
      expect(voice.tracking, id).toBeGreaterThanOrEqual(-0.03);
      expect(voice.tracking, id).toBeLessThanOrEqual(0.02);
      expect(voice.leading, id).toBeGreaterThanOrEqual(0.95);
      expect(voice.bodyLeading, id).toBeGreaterThanOrEqual(1.5);
      expect(voice.scale, id).toBeGreaterThanOrEqual(0.85);
      expect(voice.scale, id).toBeLessThanOrEqual(1.2);
    }
  });

  it("the ramp is fluid clamp() steps in ascending order", () => {
    const mins = Object.values(TYPE_RAMP).map((value) => {
      const match = /^clamp\(([\d.]+)rem,/.exec(value);
      expect(match, value).not.toBeNull();
      return Number(match![1]);
    });
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(mins[0]).toBeGreaterThanOrEqual(0.75);
  });

  it("maps a preference to its pairing's voice, with a safe default", () => {
    const warm = FONT_PAIRINGS.find((p) => p.id === "athletic-condensed")!;
    expect(typeVoiceFor(`${warm.display}|${warm.body}`)).toBe(TYPE_VOICES["athletic-condensed"]);
    expect(typeVoiceFor("Some Other Font|Karla").bodyLeading).toBeGreaterThanOrEqual(1.5);
    expect(designSystemVars(null)).toMatchObject({ "--ds-body-leading": expect.any(String) });
  });
});

describe("spacing, layering and motion", () => {
  const css = designSystemCss();

  it("declares the spacing scale, section rhythm, radius and shadow tokens", () => {
    for (const step of Object.keys(SPACE_SCALE)) expect(css).toContain(`--ds-space-${step}:`);
    for (const token of ["--ds-section-y", "--ds-container", "--ds-gutter", "--ds-radius-md", "--ds-shadow-1", "--ds-shadow-3"]) expect(css).toContain(token);
    expect(css).toContain("var(--site-space,1)");
  });

  it("is layered and zero-specificity so authored styles always win", () => {
    const layer = css.slice(css.indexOf("@layer base{"), css.indexOf("@media"));
    for (const line of layer.split("\n").slice(1, -2)) {
      expect(line.startsWith(":where(.rv-site-root)"), line.slice(0, 60)).toBe(true);
    }
  });

  it("declares every motion token as a plain CSS variable", () => {
    for (const [name, value] of Object.entries(MOTION_TOKENS)) expect(css).toContain(`${name}:${value}`);
    expect(Object.keys(MOTION_TOKENS).filter((n) => !/^--motion-(duration|ease|hover)-/.test(n))).toEqual([]);
  });

  it("zeroes durations and easing under prefers-reduced-motion, beating the token block", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion:reduce)"));
    expect(reduced.startsWith("@media (prefers-reduced-motion:reduce){.rv-site-root{")).toBe(true);
    for (const name of Object.keys(MOTION_TOKENS)) expect(reduced).toContain(`${name}:${REDUCED_MOTION_TOKENS[name as keyof typeof MOTION_TOKENS]}`);
    for (const name of Object.keys(MOTION_TOKENS).filter((n) => n.includes("duration"))) expect(REDUCED_MOTION_TOKENS[name as keyof typeof MOTION_TOKENS]).toBe("0ms");
    expect(REDUCED_MOTION_TOKENS["--motion-hover-lift"]).toBe("0px");
    expect(REDUCED_MOTION_TOKENS["--motion-hover-scale"]).toBe("1");
    // Reduced block is outside the @layer so it wins over the layered defaults.
    expect(css.indexOf("@media (prefers-reduced-motion:reduce)")).toBeGreaterThan(css.lastIndexOf("}\n"));
  });

  it("leaves alternating bands off studio canvases and sections that paint their own background", () => {
    expect(css).toContain(":not([data-studio])");
    expect(css).toContain(':not([style*="background"])');
  });

  it("is applied by the site renderer", () => {
    const view = readFileSync("src/components/site/SitePageView.tsx", "utf8");
    expect(view).toContain("designSystemCss()");
    expect(view).toContain("designSystemVars(");
  });
});

describe("authority: the design system never overrides authored styling", () => {
  const css = designSystemCss();
  const layer = css.slice(css.indexOf("@layer base{") + "@layer base{".length, css.indexOf("@media"));
  // Every rule in the layer as [selector, body]; the tokens block is the only one that sets variables.
  const rules = [...layer.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
  const PALETTE_VARS = ["--background", "--foreground", "--primary", "--primary-foreground", "--secondary", "--card", "--muted", "--muted-foreground", "--accent", "--border", "--input", "--ring", "--ds-surface-alt"];

  it("parses every layered rule and each one is :where(.rv-site-root)-scoped", () => {
    expect(rules.length).toBeGreaterThan(8);
    for (const rule of rules) expect(rule.selector.startsWith(":where(.rv-site-root)"), rule.selector).toBe(true);
  });

  it("never sets a palette variable, a text colour or a border/outline colour (the owner's and the palette editor's colours stay theirs)", () => {
    for (const rule of rules) {
      for (const name of PALETTE_VARS) expect(rule.body, `${rule.selector} sets ${name}`).not.toMatch(new RegExp(`(^|;)${name}:`));
      expect(rule.body, rule.selector).not.toMatch(/(^|;)(color|border-color|border|fill|stroke):/);
    }
  });

  it("the only background rule is the quiet band, guarded against studio canvases and painted sections", () => {
    const painting = rules.filter((rule) => /(^|;)background(-color)?:/.test(rule.body));
    expect(painting).toHaveLength(1);
    expect(painting[0]!.selector).toContain(":not([data-studio])");
    expect(painting[0]!.selector).toContain(':not([style*="background"])');
    expect(painting[0]!.selector).toContain("nth-child(even)");
    expect(painting[0]!.body).toBe("background-color:var(--ds-surface-alt,transparent)");
  });

  it("the band reads a variable the palette editor re-sets inline, so an edit recolours it", () => {
    const first = (siteThemeStyle({ primaryColor: "#1d4ed8" }) ?? {}) as Record<string, string>;
    const edited = (siteThemeStyle({ primaryColor: "#7c3aed", secondaryColor: "#faf5ff", accentColor: "#db2777" }) ?? {}) as Record<string, string>;
    expect(first["--ds-surface-alt"]).toBeTruthy();
    expect(edited["--ds-surface-alt"]).toBeTruthy();
    expect(edited["--ds-surface-alt"]).not.toBe(first["--ds-surface-alt"]);
  });

  it("the palette editor skips studio pages, which carry their own theme layer", () => {
    const bridge = readFileSync("src/components/site/PreviewSelectBridge.tsx", "utf8");
    expect(bridge).toMatch(/hasAttribute\("data-studio"\)\) return;/);
    expect(bridge).toContain("siteThemeStyle(");
  });
});
