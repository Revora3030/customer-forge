/**
 * Revora's own homepage visual concept.
 *
 * Revora's own marketing homepage backdrop, stored as fixed approved data.
 *
 * Palettes were locked to the Revora dark + gold identity; every other value is
 * the generated one. Safety, mobile behaviour and reduced-motion handling come
 * from the same validated engine the client builder uses.
 */
import { safeComposition, type VisualComposition } from "@/lib/visual-composition";

const CONCEPT = {
  id: "spotlight-underwater-mpn4km",
  name: "Spotlight × Depth",
  summary:
    "A gold spotlight that follows the visitor, over slow liquid depth and energy waves — premium, alive, and unmistakably Revora.",
  layers: [
    {
      kind: "spotlight",
      density: 45,
      speed: 23,
      scale: 50,
      opacity: 46,
      palette: "brand",
      motion: "drift",
      parallax: 30,
      interaction: "both",
      mobile: "simplify",
    },
    {
      kind: "liquid",
      density: 50,
      speed: 16,
      scale: 50,
      opacity: 34,
      palette: "deep",
      motion: "drift",
      parallax: 40,
      interaction: "none",
      mobile: "simplify",
    },
    {
      kind: "waves",
      density: 50,
      speed: 22,
      scale: 50,
      opacity: 26,
      palette: "brand",
      motion: "drift",
      parallax: 30,
      interaction: "none",
      mobile: "off",
    },
  ],
  intensity: 62,
  origin: "command",
} as const;

/** Validated at module load, so a bad edit degrades to no backdrop, never a broken page. */
export const HOMEPAGE_COMPOSITION: VisualComposition | null = safeComposition(CONCEPT);
