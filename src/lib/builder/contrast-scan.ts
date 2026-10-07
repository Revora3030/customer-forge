/**
 * WCAG 2.2 AA contrast maths for the live preview scan. Pure (tested); the
 * preview frame feeds it computed colours.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses `rgb(...)` / `rgba(...)` / `#rgb` / `#rrggbb` as returned by getComputedStyle. */
export function parseColor(value: string | null | undefined): Rgba | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.split("").map((c) => c + c).join("") : hex[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const fn = raw.match(/^rgba?\(([^)]+)\)$/);
  if (!fn) return null;
  const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean).map((part) => (part.endsWith("%") ? (parseFloat(part) / 100) * 255 : parseFloat(part)));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const alpha = parts.length > 3 ? (fn[1]!.split(/[\s,/]+/).filter(Boolean)[3]!.endsWith("%") ? parts[3]! / 255 : parts[3]!) : 1;
  return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: Math.max(0, Math.min(1, alpha)) };
}

/** Paints `top` over `bottom` (alpha compositing). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA: 3:1 for large text (≥24px, or ≥18.66px bold), else 4.5:1. */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}
