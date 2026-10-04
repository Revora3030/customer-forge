/**
 * PALETTE GUARD — rejects colourless, generic palettes before they reach a
 * customer's website.
 *
 * This never picks a colour. It only measures what the AI chose and, when the
 * palette is grey/white/black with no deliberate hue, returns plain repair
 * notes so the design team authors a real brand palette instead. Generic grey
 * surfaces with grey or black actions were the main reason generated sites
 * looked templated.
 */
import { toRgb } from "@/lib/readable-color";

/** Chroma (0-255): how far a colour is from grey. Below ~18 reads as grey. */
export function chroma(value: string | null | undefined): number | null {
  const rgb = toRgb(value ?? null);
  if (!rgb) return null;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
}

/** Mid-grey surfaces (not near-white, not near-black) with no hue. */
function isMidGrey(value: string): boolean {
  const rgb = toRgb(value);
  if (!rgb) return false;
  const c = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  const avg = (rgb.r + rgb.g + rgb.b) / 3;
  return c < 14 && avg > 70 && avg < 235;
}

export function paletteProblems(palette: {
  primary: string;
  secondary: string;
  accent?: string | null;
}): string[] {
  const problems: string[] = [];
  const primaryChroma = chroma(palette.primary);
  const accentChroma = chroma(palette.accent ?? null);
  if (isMidGrey(palette.secondary))
    problems.push("the page surface is a flat grey — choose a tinted brand surface instead");
  const surfaceChroma = chroma(palette.secondary);
  if (
    surfaceChroma !== null &&
    surfaceChroma < 6 &&
    !isMidGrey(palette.secondary) &&
    (accentChroma === null || accentChroma < 24)
  )
    problems.push(
      "the page surface is untinted white/black with no brand grounding tone — tint the surface or give the grounding tone a real hue",
    );
  if (primaryChroma !== null && primaryChroma < 40)
    problems.push("the action colour is grey/black/white — choose a saturated, memorable brand action colour");
  const allNeutral = [palette.primary, palette.secondary, palette.accent ?? palette.primary]
    .map((c) => chroma(c))
    .every((c) => c !== null && c < 24);
  if (allNeutral && !problems.length)
    problems.push("the whole palette is colourless — give the brand a real hue");
  if (accentChroma !== null && accentChroma < 12 && primaryChroma !== null && primaryChroma < 40)
    problems.push("the grounding tone has no hue either");
  return problems;
}
