import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * JC-62: the text/background token pairs used on /admin/city and /admin/jarvis
 * must reach WCAG AA (4.5:1). Pure JS: tokens are read from styles.css, so a
 * palette change that breaks a pair fails here. No axe-core.
 */
type Rgb = [number, number, number];
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

function token(name: string, seen = 0): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match || !match[1] || seen > 4) throw new Error(`token --${name} not found`);
  const value = match[1].trim();
  const ref = /^var\(--([a-z-]+)\)$/.exec(value);
  return ref && ref[1] ? token(ref[1], seen + 1) : value;
}

const toLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const fromLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
type Lab = [number, number, number];

function oklabToLinearRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
function linearRgbToOklab([r, g, b]: Rgb): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** A CSS colour (#rrggbb or oklch()) as linear-light RGB, clamped to the sRGB gamut. */
function linear(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex && hex[1]) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => fromLinear(c / 255)) as Rgb;
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (!ok) throw new Error(`unsupported colour: ${value}`);
  const [L, C, H] = [Number(ok[1]), Number(ok[2]), (Number(ok[3]) * Math.PI) / 180];
  return oklabToLinearRgb([L, C * Math.cos(H), C * Math.sin(H)]).map((c) => Math.min(1, Math.max(0, c))) as Rgb;
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function ratio(fg: Rgb, bg: Rgb): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const pair = (fg: string, bg: string) => ratio(linear(token(fg)), linear(token(bg)));

/** color-mix(in oklab, <a> pct%, <b>), as the Jarvis user bubble uses. */
function mixOklab(a: string, pct: number, b: string): Rgb {
  const x = linearRgbToOklab(linear(token(a)));
  const y = linearRgbToOklab(linear(token(b)));
  const mixed = x.map((v, i) => v * (pct / 100) + (y[i] as number) * (1 - pct / 100)) as Lab;
  return oklabToLinearRgb(mixed).map((c) => Math.min(1, Math.max(0, c))) as Rgb;
}

describe("contrast helper", () => {
  it("matches known WCAG values", () => {
    expect(ratio([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 1);
    expect(ratio(linear("#767676"), [1, 1, 1])).toBeGreaterThan(4.5);
    expect(ratio(linear("#777777"), [1, 1, 1])).toBeLessThan(4.6);
  });
});

describe("text/background token pairs in City and Jarvis meet 4.5:1", () => {
  const surface = ["background", "card"] as const;
  const textTokens = ["foreground", "muted-foreground", "gold", "destructive", "success"] as const;
  for (const bg of surface) {
    for (const fg of textTokens) {
      it(`--${fg} on --${bg}`, () => expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5));
    }
  }

  it("button ink on the gold primary (Jarvis send, City actions)", () => {
    expect(pair("primary-foreground", "primary")).toBeGreaterThanOrEqual(4.5);
  });

  // Solid fills that carry white text use --destructive-solid; --destructive stays the lighter
  // red for text on dark surfaces (one value cannot do both: white needs a darker red).
  it("white text on solid destructive (Jarvis clear-chat button, dock badge)", () => {
    expect(pair("destructive-foreground", "destructive-solid")).toBeGreaterThanOrEqual(4.5);
  });

  it("the solid token keeps the hue of --destructive", () => {
    const hue = (name: string) => Number(/oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)/.exec(token(name))?.[1]);
    expect(hue("destructive-solid")).toBe(hue("destructive"));
  });

  it("destructive text also reads on the elevated and popover surfaces (4.5:1)", () => {
    for (const bg of ["elevated", "popover"]) expect(pair("destructive", bg), `--${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("Jarvis user bubble: foreground on primary 14% mixed into card", () => {
    expect(ratio(linear(token("foreground")), mixOklab("primary", 14, "card"))).toBeGreaterThanOrEqual(4.5);
  });

  it("City map labels and state words on the city ground", () => {
    for (const fg of ["city-light", "city-muted", "city-gold", "city-cyan", "city-ok", "city-danger"]) {
      expect(pair(fg, "city-ground"), `--${fg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
