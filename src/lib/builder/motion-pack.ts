/**
 * MOTION PACK
 * ===========
 *
 * Turns a website's stored design identity into one coherent set of motion
 * choices for the whole site, instead of leaving each section to be decided
 * by hand.
 *
 * Three rules:
 *  - it only ever chooses ids from the existing allowlisted effect catalog
 *    (`site-effects.ts`), so nothing new can reach a visitor's browser;
 *  - it is deterministic, so the same identity always produces the same
 *    motion, and a rebuild never changes the character of the site;
 *  - the *character* of the movement follows the site's own motion pattern, so
 *    two businesses with different identities do not move the same way.
 *
 * Reduced motion is honoured by the stylesheet (a global
 * `prefers-reduced-motion: reduce` rule removes animation), so a visitor who
 * asks their device for less movement never sees any of this.
 */

import { isSectionEffectId, type SectionEffectId } from "@/lib/site-effects";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";

export type MotionIntensity = "none" | "subtle" | "expressive";

/** The broad character of the movement, read from the site's identity. */
export type MotionCharacter = "calm" | "depth" | "editorial" | "luminous" | "kinetic";

export type MotionPlan = {
  intensity: MotionIntensity;
  character: MotionCharacter;
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

/**
 * Sections whose job shapes how they should move, whatever the site's
 * character. Reading blocks stay legible; visual blocks may carry depth.
 */
const ROLE_OF_KIND: Record<string, "reading" | "visual" | "panel"> = {
  faq: "reading", content: "reading", about: "reading", blog: "reading", posts: "reading",
  hours: "reading", areas: "reading", guarantee: "reading", steps: "reading", process: "reading",
  gallery: "visual", logos: "visual", team: "visual", menu: "visual", rooms: "visual",
  listings: "visual", programs: "visual", classes: "visual", timeline: "visual",
  pricing: "panel", plans: "panel", testimonials: "panel", reviews: "panel",
  proof: "panel", stats: "panel", newsletter: "panel", map: "panel",
};

/** Curated pools per character. Reading blocks never get heavy movement. */
const POOLS: Record<
  MotionCharacter,
  { reading: SectionEffectId[]; visual: SectionEffectId[]; panel: SectionEffectId[] }
> = {
  calm: { reading: ["rise"], visual: ["rise"], panel: ["rise", "glass"] },
  depth: {
    reading: ["rise"],
    visual: ["parallax_slow", "float_3d", "rise"],
    panel: ["glass", "float_3d"],
  },
  editorial: {
    reading: ["rise"],
    visual: ["parallax_slow", "rise"],
    panel: ["glass", "rise"],
  },
  luminous: {
    reading: ["rise"],
    visual: ["shine", "rise", "parallax_slow"],
    panel: ["gold_glow", "glass"],
  },
  kinetic: {
    reading: ["rise"],
    visual: ["tilt_3d", "float_3d", "parallax_slow", "shine"],
    panel: ["glass", "gold_glow", "float_3d"],
  },
};

const CHARACTER_SUMMARY: Record<MotionCharacter, string> = {
  calm: "Blocks fade gently up as visitors scroll, and nothing else moves.",
  depth: "Pictures and panels drift at their own pace, giving the page real depth.",
  editorial: "Content settles into place as visitors scroll, like a printed page turning.",
  luminous: "Light sweeps across pictures and the action blocks glow as they arrive.",
  kinetic: "Pictures tilt and float in 3D and the action blocks catch the light.",
};

/** Reads the site's own motion pattern and maps it to a movement character. */
export function motionCharacter(
  fingerprint: Pick<DesignFingerprint, "motionLevel" | "motionPattern">,
  intensity: MotionIntensity,
): MotionCharacter {
  if (intensity === "none") return "calm";
  const pattern = (fingerprint.motionPattern ?? "").toLowerCase();
  const has = (needle: string) => pattern.includes(needle);

  if (has("tilt") || has("kinetic") || has("3d") || has("spring")) {
    return intensity === "expressive" ? "kinetic" : "depth";
  }
  if (has("parallax") || has("depth") || has("float") || has("drift")) return "depth";
  if (has("shine") || has("glow") || has("light") || has("shimmer") || has("gold")) return "luminous";
  if (has("fade") || has("reveal") || has("stagger") || has("editorial") || has("type")) {
    return "editorial";
  }
  return intensity === "expressive" ? "luminous" : "calm";
}

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
      character: "calm",
      summary: "No movement anywhere — the fastest, calmest option.",
      perKind,
      hover: false,
      sectionTransitions: false,
    };
  }

  const seed = Math.abs(Math.trunc(fingerprint.seed)) || 1;
  const character = motionCharacter(fingerprint, intensity);
  const pools = POOLS[character];

  CONTENT_KINDS.forEach((kind, index) => {
    const role = ROLE_OF_KIND[kind] ?? "visual";
    // A subtle site keeps reading and panel blocks quiet even when its
    // character is expressive, so long pages stay comfortable to read.
    const pool = intensity === "subtle" && role !== "visual" ? POOLS.calm[role] : pools[role];
    perKind[kind] = pool[(seed + index * 7) % pool.length] ?? "rise";
  });

  for (const kind of ACTION_KINDS) {
    perKind[kind] =
      kind === "quote" || kind === "booking" || kind === "contact"
        ? "glass"
        : intensity === "expressive" && (character === "luminous" || character === "kinetic")
          ? "shine"
          : "gold_glow";
  }

  return {
    intensity,
    character,
    summary:
      intensity === "expressive"
        ? CHARACTER_SUMMARY[character]
        : `${CHARACTER_SUMMARY[character]} Buttons and cards react to the pointer.`,
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
