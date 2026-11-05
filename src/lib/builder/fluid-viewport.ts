/**
 * FLUID VIEWPORT (B13-5) — the continuous 320 to 1440 px preview slider and the
 * badges beside it.
 *
 * Badges follow the same rule as the Terra result card (result-cards.ts): a
 * reading counts only when the preview frame itself reported it, at the width
 * now on screen. No reading at this width means "NOT MEASURED": never a pass,
 * never a made-up number.
 */
import type { CheckState } from "@/lib/builder/result-cards";

export const FLUID_MIN_WIDTH = 320;
export const FLUID_MAX_WIDTH = 1440;
/** Smallest comfortable touch target edge, in CSS pixels. */
export const TAP_TARGET_MIN_PX = 44;
/** A frame's reported width can sit a scrollbar narrower than the frame itself. */
const WIDTH_TOLERANCE_PX = 24;

/** Snap any value (slider, keyboard, stray NaN) to a whole width inside the slider's range. */
export function clampFluidWidth(value: number, fallback = 390): number {
  const base = Number.isFinite(value) ? value : fallback;
  return Math.min(FLUID_MAX_WIDTH, Math.max(FLUID_MIN_WIDTH, Math.round(base)));
}

export type OverflowReading = {
  overflow: boolean;
  clientWidth: number;
  scrollWidth: number;
  culprits: string[];
};

export type TapReading = {
  /** Controls the frame looked at. */
  checked: number;
  /** Controls with an edge under 44 px. */
  smallCount: number;
  /** Shortest edge among the small controls, or null when none were small. */
  smallest: number | null;
  clientWidth: number;
  examples: string[];
};

export type FluidBadge = {
  id: "overflow" | "tap_targets";
  label: string;
  state: CheckState;
  /** Text shown in the badge. */
  text: string;
  /** Longer explanation for the tooltip. */
  detail: string;
};

/** True only when the reading was taken at the width the preview shows now. */
export function readingMatchesWidth(clientWidth: number, viewportWidth: number): boolean {
  return Number.isFinite(clientWidth) && clientWidth > 0 && clientWidth <= viewportWidth && viewportWidth - clientWidth <= WIDTH_TOLERANCE_PX;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function overflowBadge(reading: OverflowReading | null | undefined, viewportWidth: number): FluidBadge {
  if (!reading || !readingMatchesWidth(reading.clientWidth, viewportWidth)) {
    return { id: "overflow", label: "Sideways scroll", state: "not_verified", text: "Sideways scroll: NOT MEASURED", detail: `NOT MEASURED: the preview has not reported its width at ${viewportWidth}px.` };
  }
  if (!reading.overflow) {
    return { id: "overflow", label: "Sideways scroll", state: "pass", text: `No sideways scroll at ${viewportWidth}px`, detail: `Measured: the page is ${reading.scrollWidth}px wide in a ${reading.clientWidth}px frame.` };
  }
  const culprits = reading.culprits.length ? ` Sticking out: ${reading.culprits.join(" · ")}` : "";
  return { id: "overflow", label: "Sideways scroll", state: "fail", text: `Horizontal scroll detected at ${viewportWidth}px`, detail: `Measured: the page is ${reading.scrollWidth}px wide in a ${reading.clientWidth}px frame.${culprits}` };
}

export function tapTargetBadge(reading: TapReading | null | undefined, viewportWidth: number): FluidBadge {
  if (!reading || !readingMatchesWidth(reading.clientWidth, viewportWidth)) {
    return { id: "tap_targets", label: "Tap targets", state: "not_verified", text: "Tap targets: NOT MEASURED", detail: `NOT MEASURED: the preview has not reported tap targets at ${viewportWidth}px.` };
  }
  if (reading.smallCount === 0) {
    return { id: "tap_targets", label: "Tap targets", state: "pass", text: `All ${plural(reading.checked, "tap target")} are ${TAP_TARGET_MIN_PX}px or larger`, detail: `Measured at ${viewportWidth}px across ${plural(reading.checked, "control")}.` };
  }
  const smallest = reading.smallest !== null ? `; smallest ${Math.round(reading.smallest)}px` : "";
  const examples = reading.examples.length ? ` e.g. ${reading.examples.join(" · ")}` : "";
  return {
    id: "tap_targets",
    label: "Tap targets",
    state: "fail",
    text: `${plural(reading.smallCount, "tap target")} under ${TAP_TARGET_MIN_PX}px`,
    detail: `Measured at ${viewportWidth}px: ${reading.smallCount} of ${reading.checked} controls are narrower or shorter than ${TAP_TARGET_MIN_PX}px${smallest}.${examples}`,
  };
}

export function fluidBadges(input: { viewportWidth: number; overflow: OverflowReading | null; taps: TapReading | null }): FluidBadge[] {
  return [overflowBadge(input.overflow, input.viewportWidth), tapTargetBadge(input.taps, input.viewportWidth)];
}

export type TapCandidate = { width: number; height: number; label: string };

/**
 * Turns the controls measured inside the frame into one report. Zero-size
 * (hidden) controls are never counted; the caller has already dropped
 * inline text links, which WCAG 2.5.8 exempts.
 */
export function summarizeTapTargets(candidates: readonly TapCandidate[], clientWidth: number): TapReading {
  const visible = candidates.filter((c) => c.width > 0 && c.height > 0);
  const small = visible.filter((c) => c.width < TAP_TARGET_MIN_PX || c.height < TAP_TARGET_MIN_PX);
  const smallest = small.length ? Math.min(...small.map((c) => Math.min(c.width, c.height))) : null;
  return {
    checked: visible.length,
    smallCount: small.length,
    smallest: smallest === null ? null : Math.round(smallest),
    clientWidth: Math.max(0, Math.round(clientWidth)),
    examples: small.slice(0, 3).map((c) => c.label),
  };
}
