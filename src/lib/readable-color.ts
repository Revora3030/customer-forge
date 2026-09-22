/**
 * Readability pairing for AI-chosen colours.
 *
 * The models stay in full control of the palette: this layer never replaces a
 * colour with a template colour and never rejects a design choice. It only
 * checks a text colour against the surface it will actually be painted on, and
 * — when that pair would be unreadable — walks the SAME colour lighter or
 * darker until it clears WCAG AA. Gold stays gold, navy stays navy; it simply
 * lands at a value a human can read.
 *
 * Only `rgb()`-resolvable inputs are paired. A colour the engine cannot measure
 * (`hsl()` with odd units, a translucent value, a CSS variable) is returned
 * untouched, because guessing would be worse than leaving the AI's choice.
 */

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i;

export type Rgb = { r: number; g: number; b: number };

/** Parses a measurable colour to 0-255 channels, or null when unmeasurable. */
export function toRgb(value: string | null | undefined): Rgb | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const hex = HEX3.test(raw)
    ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
    : raw;
  if (HEX6.test(hex)) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  const fn = RGB.exec(raw);
  if (fn) {
    const clamp = (n: string) => Math.min(255, Math.max(0, Number(n)));
    return { r: clamp(fn[1]!), g: clamp(fn[2]!), b: clamp(fn[3]!) };
  }
  return null;
}

const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

const lin = (channel: number) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgb): number {
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black/white). */
export function contrastRatio(a: string, b: string): number | null {
  const first = toRgb(a);
  const second = toRgb(b);
  if (!first || !second) return null;
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA thresholds: 3:1 for large display text, 4.5:1 for everything else. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

const scale = (color: Rgb, factor: number): Rgb => ({
  r: color.r * factor,
  g: color.g * factor,
  b: color.b * factor,
});

const toward = (color: Rgb, target: 0 | 255, amount: number): Rgb => ({
  r: color.r + (target - color.r) * amount,
  g: color.g + (target - color.g) * amount,
  b: color.b + (target - color.b) * amount,
});

/**
 * Returns `text` when it is already readable on `background`, otherwise the
 * nearest readable version of that same colour. Hue and chroma are preserved by
 * moving the colour toward black or white in small steps — whichever direction
 * the background allows — so the design intent survives.
 */
export function readableOn(
  text: string,
  background: string,
  options: { large?: boolean } = {},
): string {
  const target = options.large ? AA_LARGE : AA_NORMAL;
  const textRgb = toRgb(text);
  const bgRgb = toRgb(background);
  if (!textRgb || !bgRgb) return text;

  const current = contrastRatio(text, background);
  if (current !== null && current >= target) return text;

  // Push away from the background: dark surfaces get lighter text and vice versa.
  const bgLum = relativeLuminance(bgRgb);
  const directions: (0 | 255)[] = bgLum > 0.42 ? [0, 255] : [255, 0];

  for (const direction of directions) {
    for (let step = 1; step <= 20; step += 1) {
      const candidate = toHex(toward(textRgb, direction, step / 20));
      const ratio = contrastRatio(candidate, background);
      if (ratio !== null && ratio >= target) return candidate;
    }
  }
  // Nothing in this hue reached AA (a mid-grey background): fall back to the
  // extreme with the most contrast, still measured rather than assumed.
  const black = contrastRatio("#000000", background) ?? 0;
  const white = contrastRatio("#ffffff", background) ?? 0;
  return black >= white ? "#000000" : "#ffffff";
}

/**
 * A softened version of a readable colour, for supporting copy. Keeps AA by
 * re-pairing after the softening step, so "muted" never means "invisible".
 */
export function mutedOn(text: string, background: string): string {
  const textRgb = toRgb(text);
  const bgRgb = toRgb(background);
  if (!textRgb || !bgRgb) return text;
  const readable = readableOn(text, background);
  const base = toRgb(readable);
  if (!base) return readable;
  const softened = toHex(scale(base, relativeLuminance(bgRgb) > 0.42 ? 1.25 : 0.82));
  return readableOn(softened, background);
}

/** True when the pair clears AA (or cannot be measured, so nothing to flag). */
export function isReadable(text: string, background: string, large = false): boolean {
  const ratio = contrastRatio(text, background);
  if (ratio === null) return true;
  return ratio >= (large ? AA_LARGE : AA_NORMAL);
}
