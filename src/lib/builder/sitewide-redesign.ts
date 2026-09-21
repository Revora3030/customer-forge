/**
 * SITE-WIDE REDESIGN COMMAND
 * ==========================
 *
 * Turns one plain sentence from the owner — "make it feel more premium",
 * "calmer please", "bolder and more modern" — into a set of changes to the
 * website's stored design identity, applied to every page at once.
 *
 * It only ever changes design choices. No copy, prices, claims or business
 * facts are touched, and an unrecognised sentence is reported as not
 * understood rather than guessed at.
 */

import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { MotionIntensity } from "@/lib/builder/motion-pack";

export type RedesignDirection =
  | "premium"
  | "calm"
  | "bold"
  | "modern"
  | "warm"
  | "editorial"
  | "playful"
  | "technical";

export type RedesignRequest = {
  direction: RedesignDirection;
  /** The words that matched, so the owner can see why. */
  matched: string;
};

const PATTERNS: { direction: RedesignDirection; words: RegExp }[] = [
  { direction: "premium", words: /\b(premium|luxur\w*|high[- ]?end|upmarket|expensive|refined|elegant|classy)\b/i },
  { direction: "calm", words: /\b(calm\w*|quiet\w*|simpl\w*|minimal\w*|clean\w*|less busy|softer)\b/i },
  { direction: "bold", words: /\b(bold\w*|loud\w*|striking|punch\w*|stand out|dramatic|strong\w*)\b/i },
  { direction: "modern", words: /\b(modern|contemporary|fresh|current|up[- ]?to[- ]?date|sleek)\b/i },
  { direction: "warm", words: /\b(warm\w*|friendly|welcoming|inviting|homely|approachable)\b/i },
  { direction: "editorial", words: /\b(editorial|magazine|journal|story[- ]?led|publication)\b/i },
  { direction: "playful", words: /\b(playful|fun|lively|energetic|cheerful|bright)\b/i },
  { direction: "technical", words: /\b(technical|engineer\w*|precise|industrial|data[- ]?led|serious)\b/i },
];

const WHOLE_SITE = /\b(whole site|entire site|every page|all pages|site[- ]?wide|across the site|everywhere)\b/i;

/** True when the sentence asks for the change to reach every page. */
export function isSiteWide(input: string): boolean {
  return WHOLE_SITE.test(input);
}

/** Reads the direction out of the owner's sentence, or null when unclear. */
export function readRedesignRequest(input: string): RedesignRequest | null {
  const text = String(input ?? "").slice(0, 600);
  for (const pattern of PATTERNS) {
    const found = text.match(pattern.words);
    if (found?.[0]) return { direction: pattern.direction, matched: found[0] };
  }
  return null;
}

export type RedesignOverrides = {
  family: string;
  typeSystem: string;
  colorSystem: string;
  density: DesignFingerprint["density"];
  motionLevel: MotionIntensity;
  decorativeSystem: string;
  cardSystem: string;
  sectionTransition: string;
  /** One line the owner reads before it is applied. */
  describe: string;
};

const DIRECTIONS: Record<RedesignDirection, RedesignOverrides> = {
  premium: {
    family: "luxury",
    typeSystem: "serif-display",
    colorSystem: "deep-neutral",
    density: "airy",
    motionLevel: "subtle",
    decorativeSystem: "arc-stack",
    cardSystem: "bordered-quiet",
    sectionTransition: "fade-band",
    describe: "More space, a serif headline face, deeper neutral colours and quieter movement.",
  },
  calm: {
    family: "quiet",
    typeSystem: "humanist-sans",
    colorSystem: "soft-neutral",
    density: "airy",
    motionLevel: "none",
    decorativeSystem: "quiet-canvas",
    cardSystem: "plain",
    sectionTransition: "plain",
    describe: "Plenty of white space, soft colours, plain cards and no movement at all.",
  },
  bold: {
    family: "statement",
    typeSystem: "grotesque-heavy",
    colorSystem: "high-contrast",
    density: "compact",
    motionLevel: "expressive",
    decorativeSystem: "diagonal-stripes",
    cardSystem: "solid-fill",
    sectionTransition: "hard-edge",
    describe: "Heavier headlines, high contrast, filled cards and livelier movement.",
  },
  modern: {
    family: "contemporary",
    typeSystem: "geometric-sans",
    colorSystem: "cool-neutral",
    density: "balanced",
    motionLevel: "subtle",
    decorativeSystem: "dot-field",
    cardSystem: "soft-shadow",
    sectionTransition: "fade-band",
    describe: "A geometric headline face, cooler colours, soft shadows and gentle reveals.",
  },
  warm: {
    family: "welcoming",
    typeSystem: "rounded-sans",
    colorSystem: "warm-earth",
    density: "balanced",
    motionLevel: "subtle",
    decorativeSystem: "blob-drift",
    cardSystem: "rounded-tint",
    sectionTransition: "curve",
    describe: "Rounded lettering, warm earthy colours and softly tinted cards.",
  },
  editorial: {
    family: "editorial",
    typeSystem: "serif-text",
    colorSystem: "paper-ink",
    density: "airy",
    motionLevel: "subtle",
    decorativeSystem: "paper",
    cardSystem: "rule-divided",
    sectionTransition: "rule",
    describe: "Magazine-style columns, paper-and-ink colours and hairline rules between blocks.",
  },
  playful: {
    family: "lively",
    typeSystem: "rounded-sans",
    colorSystem: "bright-accent",
    density: "balanced",
    motionLevel: "expressive",
    decorativeSystem: "terrazzo",
    cardSystem: "rounded-tint",
    sectionTransition: "curve",
    describe: "Brighter accents, rounded shapes and more visible movement.",
  },
  technical: {
    family: "technical",
    typeSystem: "mono-accent",
    colorSystem: "steel",
    density: "compact",
    motionLevel: "none",
    decorativeSystem: "blueprint",
    cardSystem: "bordered-quiet",
    sectionTransition: "grid-line",
    describe: "Tighter spacing, steel colours, blueprint detailing and no movement.",
  },
};

export function redesignOverrides(direction: RedesignDirection): RedesignOverrides {
  return DIRECTIONS[direction];
}

export type RedesignChange = { field: string; from: string; to: string };

/**
 * Works out what would actually change on this site. Choices the owner has
 * previously rejected are never applied, and a field already in the target
 * state is not reported as a change.
 */
export function planRedesign(
  fingerprint: DesignFingerprint,
  direction: RedesignDirection,
): { next: DesignFingerprint; changes: RedesignChange[]; blocked: string[] } {
  const target = DIRECTIONS[direction];
  const rejected = new Set(fingerprint.rejected ?? []);
  const changes: RedesignChange[] = [];
  const blocked: string[] = [];
  const next: DesignFingerprint = { ...fingerprint };

  const fields: { field: keyof DesignFingerprint; value: string }[] = [
    { field: "family", value: target.family },
    { field: "typeSystem", value: target.typeSystem },
    { field: "colorSystem", value: target.colorSystem },
    { field: "density", value: target.density },
    { field: "motionLevel", value: target.motionLevel },
    { field: "decorativeSystem", value: target.decorativeSystem },
    { field: "cardSystem", value: target.cardSystem },
    { field: "sectionTransition", value: target.sectionTransition },
  ];

  for (const entry of fields) {
    const current = String(fingerprint[entry.field] ?? "");
    if (current === entry.value) continue;
    if (rejected.has(entry.value)) {
      blocked.push(entry.value);
      continue;
    }
    changes.push({ field: String(entry.field), from: current, to: entry.value });
    (next as unknown as Record<string, unknown>)[entry.field as string] = entry.value;
  }

  next.updatedAt = new Date().toISOString();
  return { next, changes, blocked };
}

/** Honest one-liner about what a redesign did. */
export function redesignSummary(
  direction: RedesignDirection,
  changes: RedesignChange[],
  blocked: string[],
): string {
  if (changes.length === 0) {
    return blocked.length > 0
      ? `This site is already as ${direction} as your saved preferences allow.`
      : `This site already has the ${direction} look.`;
  }
  const tail = blocked.length > 0 ? ` ${blocked.length} option(s) skipped because you turned them down before.` : "";
  return `${changes.length} design choice${changes.length === 1 ? "" : "s"} changed across every page. ${DIRECTIONS[direction].describe}${tail}`;
}
