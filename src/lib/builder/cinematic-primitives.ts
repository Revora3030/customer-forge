/**
 * Pure maths and safety rules for the cinematic composition primitives
 * (scene, scroll_chapters, offer_card, spin_viewer, collection_row), shared by
 * the validator, the renderer and the design-quality gates so every place
 * applies the same rule.
 *
 * Nothing here chooses a design: anchors, scrim colours, copy and pictures are
 * authored by the AI. These helpers only guarantee readable text over a photo,
 * honest prices and working actions.
 */
import { contrastRatio, toRgb } from "@/lib/readable-color";

/** Where the AI places a scene's copy slot (or a floating offer card). */
export const SCENE_ANCHORS = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;
export type SceneAnchor = (typeof SCENE_ANCHORS)[number];

export const DEFAULT_SCENE_ANCHOR: SceneAnchor = "bottom-left";
export const DEFAULT_OFFER_ANCHOR: SceneAnchor = "bottom-right";

const parts = (anchor: SceneAnchor): [row: string, column: string] => {
  if (anchor === "center") return ["center", "center"];
  const [row, column] = anchor.split("-") as [string, string];
  return [row, column];
};
/**
 * True when a floating offer card would sit on top of a scene's copy slot on
 * wide screens. Side-by-side placements (left vs right) are always clear;
 * anything sharing a column, or a centred column, must use opposite rows.
 */
export function anchorsCollide(copy: SceneAnchor, offer: SceneAnchor): boolean {
  if (copy === offer) return true;
  const [copyRow, copyCol] = parts(copy);
  const [offerRow, offerCol] = parts(offer);
  if (copyCol !== offerCol && copyCol !== "center" && offerCol !== "center") return false;
  const opposite = (copyRow === "top" && offerRow === "bottom") || (copyRow === "bottom" && offerRow === "top");
  return !opposite;
}

/** A spin viewer needs at least this many ordered angles to rotate; fewer render one still. */
export const MIN_SPIN_FRAMES = 8;
export const MAX_SPIN_FRAMES = 72;
export const MAX_OFFER_SPECS = 3;
export const MAX_COLLECTION_ITEMS = 12;
export const MIN_CHAPTERS = 2;
export const MAX_CHAPTERS = 8;
/** Renderer-safety ceiling for a scrim: the photo must stay visible. */
export const MAX_SCRIM_OPACITY = 95;

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const hex = (c: { r: number; g: number; b: number }) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** The colour a scrim of `opacity` (0-1) paints over a pure white or black pixel. */
export function scrimComposite(scrim: string, opacity: number, under: "light" | "dark"): string {
  const s = toRgb(scrim) ?? BLACK;
  const u = under === "light" ? WHITE : BLACK;
  const a = Math.min(1, Math.max(0, opacity));
  return hex({ r: s.r * a + u.r * (1 - a), g: s.g * a + u.g * (1 - a), b: s.b * a + u.b * (1 - a) });
}

/** Worst contrast of `ink` over the scrim, whatever the photo underneath is (pure white to pure black). */
export function worstSceneContrast(ink: string, scrim: string, opacity: number): number {
  const light = contrastRatio(ink, scrimComposite(scrim, opacity, "light")) ?? 1;
  const dark = contrastRatio(ink, scrimComposite(scrim, opacity, "dark")) ?? 1;
  return Math.min(light, dark);
}

export type SceneScrim = {
  /** Text colour actually used (the authored ink, or a readable flip when the scrim colour cannot carry it). */
  ink: string;
  /** Scrim colour (authored, else the darkest/lightest end opposite the ink). */
  scrim: string;
  /** Scrim opacity actually painted, 0-1 — never below the authored value. */
  opacity: number;
  /** Lowest opacity that would have reached the target (0-1), or null when the colour pair cannot reach it. */
  required: number | null;
  /** Worst-case contrast at `opacity`. */
  contrast: number;
  /** The two extreme composites, used as the paint context for the slot's text. */
  surfaces: [string, string];
};

/**
 * The computed scrim that guarantees WCAG AA text over ANY photograph: the
 * text is measured against the scrim composited over both a pure white and a
 * pure black pixel, and the opacity rises until both pass. The AI's own
 * opacity is a floor, never lowered. When the authored scrim colour can never
 * carry the authored ink (light text on a light scrim), the ink flips to the
 * readable end — the same correction the renderer applies everywhere else.
 */
export function sceneScrim(input: { ink?: string | null | undefined; scrim?: string | null | undefined; opacity?: number | null | undefined; large?: boolean }): SceneScrim {
  const target = input.large ? 3 : 4.5;
  const authoredInk = input.ink && toRgb(input.ink) ? input.ink : null;
  const inkLight = authoredInk ? (contrastRatio(authoredInk, "#000000") ?? 21) >= (contrastRatio(authoredInk, "#ffffff") ?? 21) : true;
  const scrim = input.scrim && toRgb(input.scrim) ? input.scrim : inkLight ? "#000000" : "#ffffff";
  const floor = Math.min(MAX_SCRIM_OPACITY, Math.max(0, input.opacity ?? 0)) / 100;
  const solve = (ink: string): number | null => {
    for (let step = Math.round(floor * 100); step <= MAX_SCRIM_OPACITY; step += 1)
      if (worstSceneContrast(ink, scrim, step / 100) >= target) return step / 100;
    return null;
  };
  let ink = authoredInk ?? (inkLight ? "#ffffff" : "#101114");
  let required = solve(ink);
  if (required === null) {
    const flipped = (contrastRatio("#ffffff", scrim) ?? 1) >= (contrastRatio("#101114", scrim) ?? 1) ? "#ffffff" : "#101114";
    const flippedRequired = solve(flipped);
    if (flippedRequired !== null) {
      ink = flipped;
      required = flippedRequired;
    }
  }
  const opacity = required ?? MAX_SCRIM_OPACITY / 100;
  return {
    ink,
    scrim,
    opacity,
    required: authoredInk && ink !== authoredInk ? null : required,
    contrast: worstSceneContrast(ink, scrim, opacity),
    surfaces: [scrimComposite(scrim, opacity, "light"), scrimComposite(scrim, opacity, "dark")],
  };
}

/** Next spin frame for a key press, or null when the key does nothing. Wraps around like a turntable. */
export function frameForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const wrap = (n: number) => ((n % count) + count) % count;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return wrap(current + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return wrap(current - 1);
    case "PageUp":
      return wrap(current + Math.max(1, Math.round(count / 8)));
    case "PageDown":
      return wrap(current - Math.max(1, Math.round(count / 8)));
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Frame for a horizontal drag: one full drag across the viewer is one full turn. */
export function frameForDrag(startFrame: number, dx: number, width: number, count: number): number {
  if (count <= 0) return 0;
  if (!(width > 0)) return ((startFrame % count) + count) % count;
  const delta = Math.round((dx / width) * count);
  return (((startFrame + delta) % count) + count) % count;
}

const CHECKOUT_PATH = /(?:^|[/?#=&_-])(?:checkout|cart|basket|payment|pay|purchase|billing)(?:[/?#=&_.-]|$)/i;
/**
 * An offer card's action must go to the business's own booking/quote page,
 * a form anchor, phone or email. External addresses and checkout-shaped
 * paths are refused: the card never pretends to be a payment flow.
 */
export function offerActionProblem(href: string | undefined): string | null {
  if (!href) return "offer_card needs exactly one button that links to the business's booking or quote page, a form anchor, phone or email";
  const value = href.trim();
  if (/^https?:/i.test(value) || value.startsWith("//"))
    return "offer_card actions stay on the business's own booking/quote page, form anchor, phone or email — never an external address or checkout";
  if (CHECKOUT_PATH.test(value))
    return "offer_card actions may not point at a checkout, cart or payment path; link the real booking or quote page instead";
  if (!/^(\/|#|tel:|mailto:)/i.test(value)) return "offer_card action must be a site page, anchor, tel: or mailto: address";
  return null;
}

/** Currency amounts typed into copy. Offer prices only ever come from the named real service. */
export const TYPED_PRICE = /(?:[$€£¥]\s?\d)|(?:\d[\d,.]*\s?(?:usd|eur|gbp|aud|cad|dollars?|euros?|pounds?)\b)/i;

/** Matches a supplied service name exactly (case and spacing insensitive). */
export function matchService<T extends { name: string }>(name: string | null | undefined, services: readonly T[]): T | null {
  const key = (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!key) return null;
  return services.find((service) => service.name.trim().replace(/\s+/g, " ").toLowerCase() === key) ?? null;
}

/** dial_selector: 2-6 options, each a label, a short reading and a 0-100 needle position. */
export const MIN_DIAL_OPTIONS = 2;
export const MAX_DIAL_OPTIONS = 6;
export const DIAL_LIMITS = { label: 28, value: 24, note: 140, unit: 16 } as const;
/** The gauge sweeps 240°, from lower-left (level 0) over the top to lower-right (level 100). */
export const DIAL_SWEEP = 240;

/** Needle angle in degrees, measured clockwise from straight up, for a 0-100 level. */
export function dialAngle(level: number): number {
  const t = Math.min(100, Math.max(0, Number.isFinite(level) ? level : 0)) / 100;
  return -DIAL_SWEEP / 2 + t * DIAL_SWEEP;
}

/** A point on the dial's circle for an angle measured clockwise from straight up. */
export function dialPoint(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: +(cx + r * Math.sin(rad)).toFixed(2), y: +(cy - r * Math.cos(rad)).toFixed(2) };
}

/** SVG arc path from level 0 to `level` on the dial. Empty at level 0. */
export function dialArcPath(cx: number, cy: number, r: number, level: number): string {
  const start = dialPoint(cx, cy, r, -DIAL_SWEEP / 2);
  const angle = dialAngle(level);
  if (angle <= -DIAL_SWEEP / 2) return "";
  const end = dialPoint(cx, cy, r, angle);
  const large = angle + DIAL_SWEEP / 2 > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/** Next option for a key press inside the dial's option group (wraps), or null. */
export function dialOptionForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const wrap = (n: number) => ((n % count) + count) % count;
  if (key === "ArrowRight" || key === "ArrowDown") return wrap(current + 1);
  if (key === "ArrowLeft" || key === "ArrowUp") return wrap(current - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * The 0-100 dial level under a pointer at (dx, dy) from the dial's centre
 * (screen axes: y grows downward), or null in the small dead zone at the hub
 * where the direction is meaningless. Pointers in the gap below the sweep
 * clamp to the nearer end.
 */
export function dialLevelForPoint(dx: number, dy: number, deadZone = 8): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < deadZone) return null;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const half = DIAL_SWEEP / 2;
  const clamped = Math.min(half, Math.max(-half, angle));
  return +(((clamped + half) / DIAL_SWEEP) * 100).toFixed(2);
}

/** Index of the option whose level is nearest `level` (first wins a tie), or null with no options. */
export function dialOptionForLevel(level: number, levels: readonly number[]): number | null {
  let best: number | null = null;
  let gap = Infinity;
  levels.forEach((value, index) => {
    const d = Math.abs(value - level);
    if (d < gap) {
      gap = d;
      best = index;
    }
  });
  return best;
}

/** The option a drag or tap on the gauge picks, from a point relative to the dial centre. */
export function dialOptionForPoint(dx: number, dy: number, levels: readonly number[]): number | null {
  const level = dialLevelForPoint(dx, dy);
  return level == null ? null : dialOptionForLevel(level, levels);
}
