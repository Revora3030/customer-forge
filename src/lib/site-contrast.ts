/**
 * WCAG AA guard for the text colours of a customer-site theme.
 *
 * The theme (site-theme.ts) builds each text colour for one surface, but the
 * same ink is painted on several surfaces (page, card, muted band), and labels
 * on brand buttons are picked by a black/white rule that can land a hair under
 * AA on mid-tone brands. This module lists every text/surface pair a theme
 * promises, measures them, and nudges any failing text colour, keeping its
 * hue, until it clears 4.5:1 on every surface it sits on.
 *
 * Unmeasurable values (CSS variables, color-mix(), translucent colours) are
 * left untouched: guessing would be worse than the authored choice.
 */
import { AA_LARGE, AA_NORMAL, contrastRatio, readableOn } from "@/lib/readable-color";

/** Text variable → the surface variables it is painted on. */
export const THEME_TEXT_PAIRS: ReadonlyArray<readonly [text: string, surfaces: readonly string[]]> = [
  ["--foreground", ["--background", "--card", "--elevated", "--secondary", "--muted"]],
  ["--card-foreground", ["--card"]],
  ["--popover-foreground", ["--popover"]],
  ["--secondary-foreground", ["--secondary"]],
  ["--muted-foreground", ["--background", "--card", "--muted"]],
  ["--primary-foreground", ["--primary"]],
  ["--accent-foreground", ["--accent"]],
  ["--primary-ink", ["--background", "--card"]],
];

export type ContrastIssue = { text: string; surface: string; ratio: number; required: number };

/** Lowest measured contrast of `text` across `surfaces` (null when nothing is measurable). */
export function minContrast(text: string, surfaces: readonly string[]): number | null {
  const ratios = surfaces.map((surface) => contrastRatio(text, surface)).filter((r): r is number => r !== null);
  return ratios.length ? Math.min(...ratios) : null;
}

/**
 * The nearest version of `text` that clears AA on every one of `surfaces`.
 * Returns `text` unchanged when it already passes or cannot be measured. When
 * no shade of the hue works on all surfaces at once, the most readable of
 * near-black, black and white is used, still measured, never assumed.
 */
export function aaTextOn(text: string, surfaces: readonly string[], options: { large?: boolean } = {}): string {
  const required = options.large ? AA_LARGE : AA_NORMAL;
  const measurable = surfaces.filter((surface) => contrastRatio(text, surface) !== null);
  if (!measurable.length) return text;
  const passes = (colour: string) => (minContrast(colour, measurable) ?? 0) >= required;
  if (passes(text)) return text;
  let current = text;
  for (let round = 0; round < 3; round += 1) {
    current = measurable.reduce((colour, surface) => readableOn(colour, surface, options), current);
    if (passes(current)) return current;
  }
  const fallbacks = ["#101114", "#000000", "#ffffff"];
  return fallbacks.reduce((best, colour) => ((minContrast(colour, measurable) ?? 0) > (minContrast(best, measurable) ?? 0) ? colour : best));
}

/** Every theme text/surface pair below AA (4.5:1). Unmeasurable pairs are skipped. */
export function themeContrastIssues(vars: Record<string, string | undefined>): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const [text, surfaces] of THEME_TEXT_PAIRS) {
    const ink = vars[text];
    if (!ink) continue;
    for (const surface of surfaces) {
      const paint = vars[surface];
      if (!paint) continue;
      const ratio = contrastRatio(ink, paint);
      if (ratio !== null && ratio < AA_NORMAL) issues.push({ text, surface, ratio: Math.round(ratio * 100) / 100, required: AA_NORMAL });
    }
  }
  return issues;
}

/** The theme with every failing text colour moved (hue kept) until all its pairs clear AA. */
export function enforceThemeAa<T extends Record<string, string | undefined>>(vars: T): T {
  const next: Record<string, string | undefined> = { ...vars };
  for (const [text, surfaces] of THEME_TEXT_PAIRS) {
    const ink = next[text];
    if (!ink) continue;
    const paints = surfaces.map((surface) => next[surface]).filter((paint): paint is string => typeof paint === "string");
    if (paints.length) next[text] = aaTextOn(ink, paints);
  }
  // The wrapper's own `color` is the page ink.
  if (next["color"] && next["--foreground"] && next["color"] === vars["--foreground"]) next["color"] = next["--foreground"];
  return next as T;
}
