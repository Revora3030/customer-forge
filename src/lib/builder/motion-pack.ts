/**
 * MOTION PACK
 * ===========
 *
 * Turns a website's stored design identity into one coherent set of motion
 * choices for the whole site, instead of leaving each section to be decided
 * by hand.
 *
 * Two rules:
 *  - it only ever chooses ids from the existing allowlisted effect catalog
 *    (`site-effects.ts`), so nothing new can reach a visitor's browser;
 *  - it is deterministic, so the same identity always produces the same
 *    motion, and a rebuild never changes the character of the site.
 *
 * Reduced motion is honoured by the stylesheet (a global
 * `prefers-reduced-motion: reduce` rule removes animation), so a visitor who
 * asks their device for less movement never sees any of this.
 */

import { isSectionEffectId, type SectionEffectId } from "@/lib/site-effects";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";

export type MotionIntensity = "none" | "subtle" | "expressive";

export type MotionPlan = {
  intensity: MotionIntensity;
  /** Plain-language summary for the owner. */
  summary: string;
  /** Effect id per section kind. Only allowlisted ids appear here. */
  perKind: Record<string, SectionEffectId>;
  /** Whether hover lift / pressed states are enabled on cards and buttons. */
  hover: boolean;
  /** Whether one section blends into the next. */
  sectionTransitions: boolean;
};

/** Sections that must never animate: above the fold, or legal/utility copy. */
const NEVER_ANIMATE = new Set(["hero", "trust_bar", "policy", "legal", "terms", "privacy"]);

/** Blocks that earn the strongest treatment, because they carry the action. */
const ACTION_KINDS = ["cta", "sticky_cta", "offer", "quote", "booking", "contact"];

/** Everything else a generated site can contain. */
const CONTENT_KINDS = [
  "about", "services", "service_detail", "features", "gallery", "team", "process",
  "steps", "faq", "pricing", "plans", "testimonials", "reviews", "proof", "stats",
  "timeline", "map", "hours", "areas", "custom", "content", "logos", "guarantee",
  "newsletter", "blog", "posts", "menu", "rooms", "listings", "programs", "classes",
];

const SUBTLE_CONTENT: SectionEffectId[] = ["rise", "rise", "glass", "rise"];
const EXPRESSIVE_CONTENT: SectionEffectId[] = ["rise", "parallax_slow", "float_3d", "tilt_3d", "shine"];

/**
 * Builds the motion plan for one website.
 *
 * `motionLevel` comes from the site's identity; a caller may override it when
 * the owner explicitly asks for more or less movement.
 */
export function buildMotionPlan(
  fingerprint: Pick<DesignFingerprint, "motionLevel" | "seed" | "motionPattern">,
  override?: MotionIntensity,
): MotionPlan {
  const intensity: MotionIntensity = override ?? fingerprint.motionLevel;
  const perKind: Record<string, SectionEffectId> = {};

  for (const kind of NEVER_ANIMATE) perKind[kind] = "none";

  if (intensity === "none") {
    for (const kind of [...ACTION_KINDS, ...CONTENT_KINDS]) perKind[kind] = "none";
    return {
      intensity,
      summary: "No movement anywhere — the fastest, calmest option.",
      perKind,
      hover: false,
      sectionTransitions: false,
    };
  }

  const seed = Math.abs(Math.trunc(fingerprint.seed)) || 1;
  const pool = intensity === "expressive" ? EXPRESSIVE_CONTENT : SUBTLE_CONTENT;

  CONTENT_KINDS.forEach((kind, index) => {
    const picked = pool[(seed + index * 7) % pool.length] ?? "rise";
    perKind[kind] = picked;
  });

  for (const kind of ACTION_KINDS) {
    perKind[kind] =
      kind === "quote" || kind === "booking" || kind === "contact"
        ? "glass"
        : intensity === "expressive"
          ? "shine"
          : "gold_glow";
  }

  return {
    intensity,
    summary:
      intensity === "expressive"
        ? "Blocks rise, drift and catch the light as visitors scroll; buttons and cards react to the pointer."
        : "Blocks fade gently up as visitors scroll; buttons and cards react to the pointer.",
    perKind,
    hover: true,
    sectionTransitions: true,
  };
}

export type MotionAssignment = {
  sectionId: string;
  kind: string;
  from: SectionEffectId;
  to: SectionEffectId;
};

/**
 * Works out which sections actually need changing. A section already carrying
 * the right effect is left alone, so applying the pack twice reports no change
 * rather than pretending to have done work.
 */
export function planMotionAssignments(
  sections: { id: string; kind: string; settings?: unknown }[],
  plan: MotionPlan,
): MotionAssignment[] {
  const out: MotionAssignment[] = [];
  for (const section of sections) {
    const target = plan.perKind[section.kind];
    if (!target) continue;
    const current = readEffect(section.settings);
    if (current === target) continue;
    out.push({ sectionId: section.id, kind: section.kind, from: current, to: target });
  }
  return out;
}

function readEffect(settings: unknown): SectionEffectId {
  if (!settings || typeof settings !== "object") return "none";
  const value = (settings as { effect?: unknown }).effect;
  return isSectionEffectId(value) ? value : "none";
}

/**
 * One line the owner can read, naming how many blocks changed. Never claims a
 * change that did not happen.
 */
export function motionSummary(assignments: MotionAssignment[], plan: MotionPlan): string {
  if (assignments.length === 0) return `Movement already matches this site (${plan.intensity}).`;
  const blocks = assignments.length === 1 ? "block" : "blocks";
  return `${assignments.length} ${blocks} updated — ${plan.summary}`;
}
