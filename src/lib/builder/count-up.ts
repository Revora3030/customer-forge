/**
 * Count-up / rolling numbers for generated sites (quality bar #16 and #20).
 *
 * Pure helpers only: the renderer and the live widgets use them to animate a
 * figure the page ALREADY shows. Nothing here invents, rounds up or changes a
 * number — the last frame is always the exact authored text, and anything that
 * is not one plain figure (a phone number, "24/7", a date, a range) is left
 * alone so it never animates into nonsense.
 */

export type CountUpParts = {
  /** Text before the figure, e.g. "$" or "Over ". At most 12 characters, no digits. */
  prefix: string;
  /** The figure itself. */
  value: number;
  /** Decimal places in the authored figure (0-2). */
  decimals: number;
  /** Whether the authored figure grouped thousands with commas. */
  grouped: boolean;
  /** Text after the figure, e.g. "+", "%", "k", " years". At most 10 characters, no digits. */
  suffix: string;
};

const FIGURE = /^([^\d]{0,12}?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?([^\d]{0,10})$/;

/** Splits "500+", "$1,200", "4.9★" or "98%" into prefix / figure / suffix; null when the text is not one plain figure. */
export function parseCountUp(text: string | null | undefined): CountUpParts | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 32) return null;
  const match = FIGURE.exec(trimmed);
  if (!match) return null;
  const [, prefix = "", whole = "", fraction, suffix = ""] = match;
  // A leading "+" or "-" next to the figure reads as a phone or a sign, and a
  // trailing separator ("1.", "3/") means more figures were meant to follow.
  if (/[+-]$/.test(prefix) || /^[./:]/.test(suffix)) return null;
  // A four-digit year ("Since 1998") is a date, not a count.
  if (!fraction && /^(?:19|20)\d{2}$/.test(whole)) return null;
  const value = Number(`${whole.replace(/,/g, "")}${fraction ? `.${fraction}` : ""}`);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { prefix, value, decimals: fraction?.length ?? 0, grouped: whole.includes(","), suffix };
}

/** easeOutCubic: fast start, gentle landing. */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** The figure to show at `progress` (0-1) of a count from `from` to `to`; exactly `to` at the end. */
export function tweenValue(from: number, to: number, progress: number): number {
  if (progress >= 1) return to;
  return from + (to - from) * easeOut(progress);
}

/** Formats a figure the way the authored text did (same decimals and grouping). */
export function formatFigure(value: number, decimals: number, grouped: boolean): string {
  const fixed = value.toFixed(decimals);
  if (!grouped) return fixed;
  const [whole = "0", fraction] = fixed.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${withCommas}.${fraction}` : withCommas;
}

/** The text for one frame of a count-up; returns the exact authored text at progress 1. */
export function countUpFrame(parts: CountUpParts, progress: number, authored: string): string {
  if (progress >= 1) return authored.trim();
  return `${parts.prefix}${formatFigure(tweenValue(0, parts.value, progress), parts.decimals, parts.grouped)}${parts.suffix}`;
}

/** Default count length: long enough to read as motion, short enough not to delay the fact. */
export const COUNT_UP_MS = 1200;
/** A live total (calculator, estimator) rolls quicker so it keeps up with the visitor's taps. */
export const ROLL_MS = 450;
