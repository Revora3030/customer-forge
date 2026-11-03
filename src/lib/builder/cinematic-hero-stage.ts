/**
 * `cinematic_hero_stage`: a declarative, layered hero (deepseek round 7, Part 4).
 *
 * The AI describes the hero as data (layers, a type lockup, reveal and scrub
 * steps, per-breakpoint registers); the renderer draws it with plain DOM, SVG
 * and CSS. Nothing here is executed: no eval, no `new Function`, no author
 * CSS strings. Colours are design-token references only (`var(--name)`), SVG
 * paths are checked against a path-data grammar, and product pixels may be
 * the owner's real ones or none, never generated.
 *
 * Deviations from the round-7 sketch, verified against its own examples:
 *  - `guardrails.maxPromotedLayers` is 1–4 (the plumber example uses 2; the
 *    sketch said literal 4).
 *  - A frame/media source may be a website picture reference (`mediaRef`)
 *    instead of a URL, because first builds may only show the section's own
 *    stored pictures.
 *  - Scrims under copy are floored at 0.72 (the site-wide body-scrim floor).
 */
import { z } from "zod";

export const HERO_STAGE_LAYER_TYPES = [
  "media_stack", "media_single", "ambient", "light_sweep", "rule_path", "grain", "scrim",
] as const;
export const HERO_STAGE_MIN_FRAMES = 4;
export const HERO_STAGE_MAX_FRAMES = 18;
export const HERO_STAGE_MIN_SCRIM = 0.72;
export const HERO_STAGE_MAX_HEADLINE_WORDS = 9;

/** `var(--token)` and nothing else: no raw CSS reaches a style attribute. */
const TOKEN = z.string().regex(/^var\(--[a-z][a-z0-9-]{0,40}\)$/, "must be a design token like var(--accent)");
const ID = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/i, "ids are short letters, digits, - or _");
const MEDIA_REF = z.string().regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|temp_[a-z0-9_]{1,30})$/i);
const URL_LIKE = z.string().min(1).max(2048).regex(/^(?:https:\/\/|\/(?!\/))/, "must be an https URL or a site path");
const UNIT = z.number().min(0).max(1);

const Channel = z.enum(["translate", "scale", "opacity", "clip", "rotate", "none"]);

const Frame = z
  .object({
    src: URL_LIKE.optional(),
    mediaRef: MEDIA_REF.optional(),
    alt: z.string().min(1).max(180),
    focal: z.tuple([UNIT, UNIT]).optional(),
  })
  .strict()
  .refine((f) => Boolean(f.src) !== Boolean(f.mediaRef), "a frame needs exactly one of src or mediaRef");

const MediaStack = z
  .object({
    type: z.literal("media_stack"),
    id: ID,
    channel: z.literal("opacity"),
    frames: z.array(Frame).min(HERO_STAGE_MIN_FRAMES).max(HERO_STAGE_MAX_FRAMES),
    compositing: z.enum(["overlay", "blend"]).default("overlay"),
    holdFraction: z.number().min(0).max(0.9).default(0.4),
    promotedWindow: z.literal(3).default(3),
    scrub: z.object({ range: z.tuple([UNIT, UNIT]) }).strict().default({ range: [0.05, 0.95] }),
    source: z.enum(["owner_upload", "generated_environment", "composite"]),
    /** "generated" is deliberately not a legal value. */
    productPixels: z.enum(["real", "none"]).default("none"),
  })
  .strict();

const MediaSingle = z
  .object({
    type: z.literal("media_single"),
    id: ID,
    channel: Channel.default("scale"),
    src: URL_LIKE.optional(),
    mediaRef: MEDIA_REF.optional(),
    alt: z.string().min(1).max(180),
    kind: z.enum(["photo", "video"]).default("photo"),
    poster: URL_LIKE.optional(),
    scrubVideo: z.boolean().default(false),
    objectFit: z.enum(["cover", "contain"]).default("cover"),
  })
  .strict()
  .refine((m) => Boolean(m.src) !== Boolean(m.mediaRef), "media_single needs exactly one of src or mediaRef");

const Ambient = z
  .object({
    type: z.literal("ambient"),
    id: ID,
    channel: z.literal("translate"),
    washes: z
      .array(
        z
          .object({
            color: TOKEN,
            at: z.string().regex(/^\d{1,3}% \d{1,3}%$/, 'must look like "70% 20%"'),
            radius: z.string().regex(/^(?:ellipse|circle)(?: \d{1,3}%){1,2}$/, 'must look like "ellipse 80% 60%"'),
            opacity: z.number().min(0).max(0.14),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    drift: z
      .object({ x: z.number().min(0).max(24), y: z.number().min(0).max(24), periodMs: z.number().min(12000).max(120000) })
      .strict()
      .optional(),
  })
  .strict();

const LightSweep = z
  .object({
    type: z.literal("light_sweep"),
    id: ID,
    channel: z.literal("translate"),
    angleDeg: z.number().min(-180).max(180),
    widthPct: z.number().min(8).max(40),
    color: TOKEN,
    opacity: z.number().min(0).max(0.35),
    mask: z.enum(["none", "image-luminance"]).default("image-luminance"),
  })
  .strict();

/** SVG path data: commands and numbers only, in a 0–100 box. */
const PATH_DATA = /^M[\s\d.,MmLlHhVvCcSsQqTtAaZz-]*$/;
const RulePath = z
  .object({
    type: z.literal("rule_path"),
    id: ID,
    channel: z.literal("clip"),
    d: z.string().max(600).regex(PATH_DATA, "must be SVG path data starting with M"),
    stroke: TOKEN,
    strokeWidth: z.number().min(0.5).max(6),
    drawRange: z.tuple([UNIT, UNIT]).default([0, 0.8]),
  })
  .strict();

const Grain = z
  .object({
    type: z.literal("grain"),
    id: ID,
    channel: z.literal("none"),
    opacity: z.number().min(0.1).max(0.25).default(0.16),
    blend: z.enum(["overlay", "soft-light"]).default("overlay"),
    /** Static only: an animated grain repaints the whole viewport every frame. */
    animate: z.literal(false).default(false),
  })
  .strict();

const Scrim = z
  .object({
    type: z.literal("scrim"),
    id: ID,
    channel: z.literal("none"),
    direction: z.enum(["to-top", "to-bottom", "to-right", "radial"]),
    strength: z.number().min(HERO_STAGE_MIN_SCRIM).max(0.9),
    token: TOKEN.default("var(--scrim-strong)"),
  })
  .strict();

export const HeroStageLayer = z.discriminatedUnion("type", [MediaStack, MediaSingle, Ambient, LightSweep, RulePath, Grain, Scrim]);

const Lockup = z
  .object({
    eyebrow: z.object({ text: z.string().min(1).max(48), style: z.enum(["overline", "none"]).default("overline") }).strict().optional(),
    headline: z
      .object({
        text: z.string().min(1).max(72),
        lines: z.array(z.string().min(1).max(72)).max(3).optional(),
        emphasis: z
          .array(z.object({ word: z.string().min(1).max(32), effect: z.enum(["none", "clip-wipe", "weight-shift"]) }).strict())
          .max(2)
          .default([]),
      })
      .strict(),
    sub: z.object({ text: z.string().min(1).max(160) }).strict().optional(),
    cta: z
      .object({ label: z.string().min(1).max(28), href: z.string().min(1).max(512), secondary: z.string().min(1).max(28).optional() })
      .strict()
      .optional(),
    placement: z.enum(["bottom-left", "bottom-center", "split-left", "stacked-center", "top-left"]),
    maxWidthCh: z.number().min(14).max(34).default(22),
  })
  .strict();

const LOCKUP_TARGETS = ["lockup.eyebrow", "lockup.headline", "lockup.sub", "lockup.cta"] as const;

const RevealStep = z
  .object({
    target: z.string().max(48),
    effect: z.enum(["clip-wipe-up", "clip-wipe-right", "iris-open", "rise", "curtain-roll", "mask-line"]),
    delayMs: z.number().min(0).max(900).default(0),
    durationMs: z.number().min(280).max(1200).default(700),
    easing: z.enum(["expo.out", "power3.out", "quart.out"]).default("expo.out"),
    /** Locked: reveals never replay. */
    once: z.literal(true).default(true),
  })
  .strict();

const ScrubStep = z
  .object({
    target: z.string().max(48),
    property: z.enum(["opacity", "translateX", "translateY", "scale", "rotate", "clipInsetBottom", "pathDraw", "frameIndex"]),
    from: z.union([z.number(), z.string().regex(/^-?\d{1,4}(?:\.\d+)?%$/)]),
    to: z.union([z.number(), z.string().regex(/^-?\d{1,4}(?:\.\d+)?%$/)]),
    range: z.tuple([UNIT, UNIT]),
    easing: z.enum(["none", "linear"]).default("none"),
  })
  .strict();

const Register = z
  .object({
    lockup: z.enum(["bottom-left", "stacked-center", "split-left", "stacked-left"]),
    headlineToken: z.enum(["--step-6", "--step-7", "--display-1", "--display-2"]),
    mediaAspect: z.enum(["4/5", "1/1", "3/2", "16/9"]),
    showLayers: z.array(ID).max(7).optional(),
    stageHeight: z.enum(["72svh", "88svh", "100svh"]),
  })
  .strict();

export const SIGNATURE_VERB_CLASSES = [
  "scroll/scrub", "hover/reveal", "drag/steer", "press/strike", "turn/rotate", "type/command", "ambient/no-input",
] as const;

export const CinematicHeroStageSchema = z
  .object({
    kind: z.literal("cinematic_hero_stage"),
    id: ID,
    signature: z
      .object({
        verb: z.enum(SIGNATURE_VERB_CLASSES),
        oneLiner: z.string().min(1).max(90),
        bespokeTestPassed: z.literal(true),
        mediumArbitration: z.enum(["rendered-scene", "scrubbed-real-media", "displayed-real-media", "css-choreography"]),
      })
      .strict(),
    stage: z
      .object({
        height: z.enum(["screen", "screen-tall", "auto"]).default("screen"),
        pin: z
          .object({ enabled: z.boolean(), distance: z.enum(["none", "short", "medium", "long"]) })
          .strict()
          .default({ enabled: false, distance: "none" }),
        perspective: z.boolean().default(false),
      })
      .strict(),
    layers: z.array(HeroStageLayer).min(2).max(7),
    lockup: Lockup,
    motion: z.object({ reveals: z.array(RevealStep).max(5), scrubs: z.array(ScrubStep).max(8) }).strict(),
    responsive: z
      .object({
        typeScale: z.object({ min: z.literal("320px"), max: z.literal("2560px") }).strict(),
        narrow: Register,
        mid: Register,
        wide: Register,
        disableOnMobile: z.array(ID).max(7).default([]),
      })
      .strict(),
    a11y: z
      .object({
        reducedMotion: z.enum(["static-poster", "instant-reveal"]).default("static-poster"),
        contrastCheckedAt: z.array(UNIT).max(8).default([]),
      })
      .strict(),
    guardrails: z
      .object({
        maxPromotedLayers: z.number().int().min(1).max(4).default(4),
        maxScrollChapters: z.number().int().min(1).max(3).default(2),
        polishPatternsUsed: z.number().int().min(0).max(1).default(1),
      })
      .strict(),
    /** Diversity stamp read by the next generation; never rendered. */
    stamp: z.string().max(200),
  })
  .strict();

export type CinematicHeroStage = z.infer<typeof CinematicHeroStageSchema>;
export type HeroStageLayerSpec = z.infer<typeof HeroStageLayer>;

/** Layers that get their own compositor layer (will-change) when animated. */
export function promotedLayerIds(stage: CinematicHeroStage): string[] {
  const scrubbed = new Set(stage.motion.scrubs.map((s) => s.target));
  return stage.layers
    .filter((l) => l.type !== "grain" && l.type !== "scrim" && (scrubbed.has(l.id) || (l.type === "ambient" && l.drift)))
    .map((l) => l.id);
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Rules the schema cannot express on its own. */
function semanticIssues(stage: CinematicHeroStage): { path: string; problem: string }[] {
  const issues: { path: string; problem: string }[] = [];
  const ids = stage.layers.map((l) => l.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) issues.push({ path: "layers", problem: "layer ids must be unique" });
  const byId = new Map(stage.layers.map((l) => [l.id, l]));
  if (words(stage.lockup.headline.text) > HERO_STAGE_MAX_HEADLINE_WORDS)
    issues.push({ path: "lockup.headline.text", problem: `the headline is at most ${HERO_STAGE_MAX_HEADLINE_WORDS} words` });
  const lines = stage.lockup.headline.lines;
  if (lines?.length && lines.join(" ").replace(/\s+/g, " ").trim() !== stage.lockup.headline.text.replace(/\s+/g, " ").trim())
    issues.push({ path: "lockup.headline.lines", problem: "headline lines must be the headline text split into lines, word for word" });
  for (const [i, e] of stage.lockup.headline.emphasis.entries())
    if (!stage.lockup.headline.text.toLowerCase().includes(e.word.toLowerCase()))
      issues.push({ path: `lockup.headline.emphasis[${i}].word`, problem: "an emphasised word must appear in the headline" });
  if (!stage.layers.some((l) => l.type === "media_stack" || l.type === "media_single" || l.type === "rule_path" || l.type === "ambient"))
    issues.push({ path: "layers", problem: "a hero stage needs at least one visual layer (media, ambient or rule_path)" });
  stage.layers.forEach((l, i) => {
    if (l.type === "media_stack" && l.productPixels === "real" && l.source === "generated_environment")
      issues.push({ path: `layers[${i}].productPixels`, problem: "a generated environment cannot carry real product pixels; use owner_upload or composite" });
  });
  if (stage.layers.filter((l) => l.type === "grain").length > 1) issues.push({ path: "layers", problem: "at most one grain layer" });
  const hasMedia = stage.layers.some((l) => l.type === "media_stack" || l.type === "media_single");
  if (hasMedia && !stage.layers.some((l) => l.type === "scrim"))
    issues.push({ path: "layers", problem: "copy over media needs a scrim layer (strength ≥ 0.72)" });
  const reveals = new Set<string>();
  stage.motion.reveals.forEach((r, i) => {
    if (!idSet.has(r.target) && !(LOCKUP_TARGETS as readonly string[]).includes(r.target))
      issues.push({ path: `motion.reveals[${i}].target`, problem: `unknown target "${r.target}"` });
    if (reveals.has(r.target)) issues.push({ path: `motion.reveals[${i}].target`, problem: "one reveal per target" });
    reveals.add(r.target);
  });
  const channels = new Set<string>();
  stage.motion.scrubs.forEach((s, i) => {
    const at = `motion.scrubs[${i}]`;
    const layer = byId.get(s.target);
    if (!layer) {
      issues.push({ path: `${at}.target`, problem: `unknown layer "${s.target}"` });
      return;
    }
    if (s.range[0] >= s.range[1]) issues.push({ path: `${at}.range`, problem: "range must run forwards" });
    if (s.property === "frameIndex") {
      if (layer.type !== "media_stack") issues.push({ path: `${at}.property`, problem: "frameIndex only drives a media_stack" });
      else if (typeof s.from !== "number" || typeof s.to !== "number" || s.from < 0 || s.to > layer.frames.length - 1)
        issues.push({ path: at, problem: `frameIndex runs between 0 and ${layer.frames.length - 1}` });
    }
    if (s.property === "pathDraw" && layer.type !== "rule_path") issues.push({ path: `${at}.property`, problem: "pathDraw only drives a rule_path" });
    if (layer.type === "grain" || layer.type === "scrim") issues.push({ path: `${at}.target`, problem: `${layer.type} layers do not move` });
    // One transform channel per layer: two steps on the same property would fight.
    const key = `${s.target}:${s.property}`;
    if (channels.has(key)) issues.push({ path: at, problem: "one scrub per layer and property" });
    channels.add(key);
  });
  const promoted = promotedLayerIds(stage).length;
  if (promoted > stage.guardrails.maxPromotedLayers)
    issues.push({ path: "guardrails.maxPromotedLayers", problem: `${promoted} animated layers exceed the stage's limit of ${stage.guardrails.maxPromotedLayers}` });
  for (const key of ["narrow", "mid", "wide"] as const)
    for (const id of stage.responsive[key].showLayers ?? [])
      if (!idSet.has(id)) issues.push({ path: `responsive.${key}.showLayers`, problem: `unknown layer "${id}"` });
  for (const id of stage.responsive.disableOnMobile)
    if (!idSet.has(id)) issues.push({ path: "responsive.disableOnMobile", problem: `unknown layer "${id}"` });
  if (stage.stage.pin.enabled !== (stage.stage.pin.distance !== "none"))
    issues.push({ path: "stage.pin", problem: "a pinned stage needs a distance; an unpinned one uses none" });
  return issues;
}

export type HeroStageResult =
  | { ok: true; stage: CinematicHeroStage }
  | { ok: false; issues: { path: string; problem: string }[] };

/** Schema + semantic validation. Never throws, never substitutes a design. */
export function parseHeroStage(raw: unknown): HeroStageResult {
  const parsed = CinematicHeroStageSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 12).map((issue) => ({ path: issue.path.map(String).join(".") || "(stage)", problem: issue.message })),
    };
  const issues = semanticIssues(parsed.data);
  return issues.length ? { ok: false, issues } : { ok: true, stage: parsed.data };
}

/** Every visitor-facing string in a stage, for the fact/claims screen. */
export function heroStageTexts(stage: CinematicHeroStage): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const add = (path: string, text: string | undefined) => {
    if (text) out.push({ path, text });
  };
  add("lockup.eyebrow.text", stage.lockup.eyebrow?.text);
  add("lockup.headline.text", stage.lockup.headline.text);
  stage.lockup.headline.lines?.forEach((line, i) => add(`lockup.headline.lines[${i}]`, line));
  add("lockup.sub.text", stage.lockup.sub?.text);
  add("lockup.cta.label", stage.lockup.cta?.label);
  add("lockup.cta.secondary", stage.lockup.cta?.secondary);
  for (const [i, layer] of stage.layers.entries()) {
    if (layer.type === "media_stack") layer.frames.forEach((f, j) => add(`layers[${i}].frames[${j}].alt`, f.alt));
    if (layer.type === "media_single") add(`layers[${i}].alt`, layer.alt);
  }
  return out;
}

/** Every picture a stage references, for source and ownership checks. */
export function heroStageSources(stage: CinematicHeroStage): { path: string; src?: string; mediaRef?: string }[] {
  const out: { path: string; src?: string; mediaRef?: string }[] = [];
  for (const [i, layer] of stage.layers.entries()) {
    if (layer.type === "media_stack")
      layer.frames.forEach((f, j) => out.push({ path: `layers[${i}].frames[${j}]`, ...(f.src ? { src: f.src } : {}), ...(f.mediaRef ? { mediaRef: f.mediaRef } : {}) }));
    if (layer.type === "media_single") {
      out.push({ path: `layers[${i}]`, ...(layer.src ? { src: layer.src } : {}), ...(layer.mediaRef ? { mediaRef: layer.mediaRef } : {}) });
      if (layer.poster) out.push({ path: `layers[${i}].poster`, src: layer.poster });
    }
  }
  return out;
}
