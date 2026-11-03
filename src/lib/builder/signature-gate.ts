/**
 * The bespoke-signature gate (deepseek round 7, Part 6 §6.3), deterministic
 * where it can be:
 *
 *  T1 VERB    — `oneLiner` reads "the one where you <verb> …" with an approved verb.
 *  T2 RIVAL   — at least two rejected ideas, and (when embeddings are available)
 *               the mechanic is not a near-copy (cosine > 0.86) of a stock
 *               category mechanic any rival in the trade could ship unchanged.
 *  T3 LEGIBLE — `oneLiner` ≤ 90 chars and free of mood words.
 *  T4 LIVE    — NOT checked at generation (it needs driven screenshots); every
 *               signature leaves here `signatureUnproven: true`.
 *  T5 BUILD   — world, verb class and medium are from the enums, and the layer
 *               sketch uses only the hero-stage layer vocabulary.
 *
 * Pure: no model or network access. The embedding check takes vectors the
 * caller fetched; this file only does the arithmetic.
 */

export const SIGNATURE_WORLDS = ["objects", "space", "process", "material", "tool"] as const;
export const SIGNATURE_VERB_CLASSES = [
  "scroll/scrub",
  "hover/reveal",
  "drag/steer",
  "press/strike",
  "turn/rotate",
  "type/command",
  "ambient/no-input",
] as const;
export const SIGNATURE_MEDIA = [
  "displayed-real-media",
  "scrubbed-real-media",
  "rendered-scene",
  "css-choreography",
] as const;
/** The layer vocabulary a signature may be built from (the cinematic hero stage's layers). */
export const SIGNATURE_LAYERS = [
  "media_stack",
  "media_single",
  "ambient",
  "light_sweep",
  "rule_path",
  "grain",
  "scrim",
] as const;

/** Verbs a stranger performs (or watches happen) and can name back. */
export const APPROVED_VERBS = new Set([
  "scroll", "scrub", "rewind", "wind", "drag", "steer", "drive", "pull", "push", "slide",
  "swipe", "hover", "reveal", "uncover", "peel", "lift", "press", "strike", "tap", "stamp",
  "turn", "rotate", "spin", "twist", "dial", "tilt", "type", "command", "watch", "follow",
  "trace", "draw", "sweep", "wipe", "open", "unfold", "fold", "stack", "sort", "pour",
  "fill", "build", "assemble", "cut", "sand", "measure", "walk", "step", "climb", "light",
  "switch", "flip", "zoom", "pan", "focus", "sharpen", "polish", "brush", "paint", "plant",
  "grow", "load", "pack", "ship", "stitch", "weave", "tune", "mix", "level", "frame",
]);

/** Mood and adjective words that describe a feeling instead of a mechanic (T3). */
export const BANNED_MOOD_WORDS = [
  "cinematic", "immersive", "stunning", "seamless", "elegant", "premium",
  "beautiful", "sleek", "modern", "luxurious", "dynamic", "engaging",
] as const;

/**
 * Stock category mechanics: what any rival in any trade could ship unchanged.
 * A mechanic whose embedding sits this close to one of these fails T2. (The
 * spec compares against the last 20 signatures for the trade; there is no
 * store for those without a schema change, so this fixed rival set stands in.)
 */
export const STOCK_RIVAL_MECHANICS = [
  "Sections fade and slide up into view as you scroll down the page.",
  "The hero background image moves slower than the page as you scroll, a parallax effect.",
  "A magnetic call-to-action button that follows the cursor when you hover near it.",
  "An image carousel of project photos that auto-advances and can be swiped.",
  "A before and after slider you drag to compare two photos.",
  "Statistics count up from zero when they scroll into view.",
  "Gallery tiles zoom in slightly and show a caption when you hover.",
  "A full-screen background video plays behind the headline.",
  "A marquee of logos or words scrolls continuously across the screen.",
  "The sticky header shrinks and changes colour as you scroll.",
] as const;

export const T2_MAX_COSINE = 0.86;
export const ONE_LINER_MAX = 90;

export type SignatureCandidate = {
  world: (typeof SIGNATURE_WORLDS)[number];
  verbClass: (typeof SIGNATURE_VERB_CLASSES)[number];
  verb: string;
  oneLiner: string;
  mechanic: string;
  medium: (typeof SIGNATURE_MEDIA)[number];
  layerSketch: (typeof SIGNATURE_LAYERS)[number][];
  rejected: { idea: string; failedTest: string; why: string }[];
};

export type GateId = "T1" | "T2" | "T3" | "T5";
export type GateFailure = { test: GateId; reason: string };

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** Reads the model's JSON into a candidate; returns failures for anything structurally wrong (T5). */
export function readSignature(raw: unknown): { candidate: SignatureCandidate | null; failures: GateFailure[] } {
  const failures: GateFailure[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { candidate: null, failures: [{ test: "T5", reason: "the answer was not a JSON object" }] };
  const data = raw as Record<string, unknown>;
  const world = text(data["world"], 40)?.toLowerCase() ?? "";
  const verbClass = text(data["verbClass"], 40)?.toLowerCase() ?? "";
  const medium = text(data["medium"], 40)?.toLowerCase() ?? "";
  const verb = text(data["verb"], 40)?.toLowerCase() ?? "";
  const oneLiner = text(data["oneLiner"], 400) ?? "";
  const mechanic = text(data["mechanic"], 600) ?? "";
  const layers = Array.isArray(data["layerSketch"]) ? data["layerSketch"].map((l) => String(l).trim()) : null;
  const rejected = Array.isArray(data["rejected"])
    ? data["rejected"]
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((r) => ({ idea: text(r["idea"], 200) ?? "", failedTest: text(r["failedTest"], 8) ?? "", why: text(r["why"], 200) ?? "" }))
        .filter((r) => r.idea)
    : [];

  if (!(SIGNATURE_WORLDS as readonly string[]).includes(world))
    failures.push({ test: "T5", reason: `world must be one of ${SIGNATURE_WORLDS.join(", ")}` });
  if (!(SIGNATURE_VERB_CLASSES as readonly string[]).includes(verbClass))
    failures.push({ test: "T5", reason: `verbClass must be one of ${SIGNATURE_VERB_CLASSES.join(", ")}` });
  if (!(SIGNATURE_MEDIA as readonly string[]).includes(medium))
    failures.push({ test: "T5", reason: `medium must be one of ${SIGNATURE_MEDIA.join(", ")}` });
  if (!layers || !layers.length) failures.push({ test: "T5", reason: "layerSketch must list at least one layer" });
  else {
    const unknown = layers.filter((l) => !(SIGNATURE_LAYERS as readonly string[]).includes(l));
    if (unknown.length) failures.push({ test: "T5", reason: `layerSketch uses layers outside the allowed set: ${unknown.join(", ")}` });
  }
  if (!mechanic) failures.push({ test: "T5", reason: "mechanic is missing" });
  if (!oneLiner) failures.push({ test: "T1", reason: "oneLiner is missing" });
  if (failures.length) return { candidate: null, failures };
  return {
    candidate: {
      world: world as SignatureCandidate["world"],
      verbClass: verbClass as SignatureCandidate["verbClass"],
      verb,
      oneLiner,
      mechanic,
      medium: medium as SignatureCandidate["medium"],
      layerSketch: [...new Set(layers!)] as SignatureCandidate["layerSketch"],
      rejected,
    },
    failures,
  };
}

/** Reduces simple inflections to the approved base verb ("drags" → "drag", "steering" → "steer"). */
function baseVerb(word: string): string | null {
  const w = word.toLowerCase();
  const tries = [w, w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""), w.replace(/ing$/, ""), w.replace(/ing$/, "e"), w.replace(/([a-z])\1ing$/, "$1")];
  return tries.find((t) => APPROVED_VERBS.has(t)) ?? null;
}

/** T1: names a verb, not a mood. */
export function checkT1(candidate: Pick<SignatureCandidate, "oneLiner">): GateFailure[] {
  const match = /^the one where you ([a-z]+)\b/i.exec(candidate.oneLiner.trim());
  if (!match) return [{ test: "T1", reason: 'oneLiner must start "the one where you <verb> …"' }];
  if (!baseVerb(match[1]!)) return [{ test: "T1", reason: `"${match[1]}" is not an approved action verb` }];
  return [];
}

/** T3: legible in one breath. */
export function checkT3(candidate: Pick<SignatureCandidate, "oneLiner">): GateFailure[] {
  const failures: GateFailure[] = [];
  if (candidate.oneLiner.length > ONE_LINER_MAX)
    failures.push({ test: "T3", reason: `oneLiner is ${candidate.oneLiner.length} chars; the limit is ${ONE_LINER_MAX}` });
  const moods = BANNED_MOOD_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(candidate.oneLiner));
  if (moods.length) failures.push({ test: "T3", reason: `oneLiner uses mood words: ${moods.join(", ")}` });
  return failures;
}

/** T2 (deterministic half): the model really tried and discarded at least two ideas. */
export function checkT2Rejections(candidate: Pick<SignatureCandidate, "rejected">): GateFailure[] {
  return candidate.rejected.length >= 2
    ? []
    : [{ test: "T2", reason: "rejected must list at least two discarded ideas" }];
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** T2 (embedding half): the mechanic vs each stock rival mechanic. */
export function checkT2Similarity(mechanic: readonly number[], rivals: readonly (readonly number[])[]): {
  failures: GateFailure[];
  maxCosine: number;
} {
  let maxCosine = 0;
  let worst = -1;
  rivals.forEach((rival, index) => {
    const c = cosine(mechanic, rival);
    if (c > maxCosine) {
      maxCosine = c;
      worst = index;
    }
  });
  return maxCosine > T2_MAX_COSINE
    ? {
        maxCosine,
        failures: [{ test: "T2", reason: `the mechanic is a stock rival mechanic (cosine ${maxCosine.toFixed(2)} to "${STOCK_RIVAL_MECHANICS[worst] ?? "a rival"}")` }],
      }
    : { maxCosine, failures: [] };
}

/** All deterministic gates (T1, T2 rejections, T3); T5 already ran in `readSignature`. */
export function deterministicGate(candidate: SignatureCandidate): GateFailure[] {
  return [...checkT1(candidate), ...checkT2Rejections(candidate), ...checkT3(candidate)];
}
