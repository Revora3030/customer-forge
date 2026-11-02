/**
 * Video-bar scorer, part 2: weighted, machine-checkable criteria.
 *
 * Rates a generated site against the reference-video bar (revora/builder/video-quality-spec.md, anti-ai-look-check.md)
 * and returns a 0-100 score with a per-criterion breakdown, so a site below the bar can be regenerated part by part
 * and a site that never reaches it can be stopped before it goes live.
 *
 * Pure. Every number the spec gives is a design target, so the thresholds here are the spec's targets and are
 * named in one table (`LIMITS`). The spec sets no pass mark, so the bar is `VIDEO_BAR` (85).
 *
 * Truth rules are not weighed away: an invented fact, or a site with no way to reach the owner, caps the score under
 * the bar whatever else it scores.
 */
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { contrastRatio } from "@/lib/readable-color";
import type { LoadedBlueprint } from "@/lib/builder/quality/blueprint-loader";
import { findInventedFacts, type IntakeFacts } from "@/lib/builder/quality/facts-guard";
import { checkMobile390 } from "@/lib/builder/quality/mobile-390";
import { extractFeatures, type FlatNode, type ModelSection, type SiteFeatures, type SiteModel } from "@/lib/builder/quality/video-site-model";

/** The spec sets no numeric pass mark. */
export const VIDEO_BAR = 85;
/** A truth failure or a site with no lead capture can never score above this, so it can never pass. */
export const HARD_CAP = 69;
/** A criterion at or above this counts as met in the breakdown. */
export const CRITERION_PASS = 0.8;

/** Spec targets in one place (video-quality-spec §1). */
export const LIMITS = {
  displayMinPx: 44, // clamp(2.75rem, ...)
  h2MinPx: 32, // clamp(2rem, ...)
  bodyMinPx: 16,
  displayMaxLineHeight: 1.1,
  maxFonts: 2,
  minHomeImages: 3,
  minHomeSections: 6,
  maxHomeSections: 14,
  revealShare: 0.6,
  maxDurationMs: 1200,
  minAccentContrast: 4.5,
  maxChromaticHues: 2,
} as const;

export type CriterionId =
  | "hero_cinematic" | "scroll_story" | "scroll_motion" | "signature_tool" | "lead_capture" | "cta_bar"
  | "type_rules" | "palette_rules" | "images" | "section_rhythm" | "mobile_layout" | "mobile_390" | "anti_ai_lint" | "truth_facts";

export const CRITERIA_WEIGHTS: Readonly<Record<CriterionId, number>> = {
  hero_cinematic: 9, scroll_story: 9, scroll_motion: 6, signature_tool: 12, lead_capture: 10, cta_bar: 4,
  type_rules: 6, palette_rules: 6, images: 7, section_rhythm: 6, mobile_layout: 6, mobile_390: 8, anti_ai_lint: 7, truth_facts: 4,
};

export const CRITERIA_LABELS: Readonly<Record<CriterionId, string>> = {
  hero_cinematic: "Cinematic opening with motion",
  scroll_story: "Scroll-driven story",
  scroll_motion: "Sections that animate in as you scroll",
  signature_tool: "A signature interactive tool",
  lead_capture: "A clear way to enquire or book",
  cta_bar: "Always-reachable call to action on phones",
  type_rules: "Type: two families, big display lines, readable body",
  palette_rules: "Palette: one accent, readable contrast, no default look",
  images: "Real pictures: enough of them, described, none stock or placeholder",
  section_rhythm: "Section rhythm and order",
  mobile_layout: "Phone layout",
  mobile_390: "Phone check at 390px: nothing broken, hidden or in the way",
  anti_ai_lint: "No template or AI-written look",
  truth_facts: "Only the owner's real facts",
};

export type CriterionResult = {
  id: CriterionId;
  label: string;
  weight: number;
  /** 0 to 1. */
  score: number;
  points: number;
  met: boolean;
  /** What was found, in plain words. */
  detail: string;
  /** What to change, in plain words. Empty when met. */
  fix: string;
  /** Section ids to regenerate. */
  sections: string[];
  /** Things to add that do not exist yet, such as `signature-tool`. */
  missing: string[];
};

export type VideoScoreInput = {
  site: SiteModel;
  blueprint: Pick<LoadedBlueprint, "slug" | "label" | "palette" | "fonts" | "scrollComponent" | "signatureTool" | "sections" | "omitIfMissing">;
  intake: IntakeFacts;
};

export type VideoScore = {
  /** 0-100 whole number, after the hard caps. */
  score: number;
  /** The score before the hard caps. */
  rawScore: number;
  bar: number;
  passed: boolean;
  /** Why the score was capped under the bar, if it was. */
  capped: "invented_facts" | "no_lead_capture" | null;
  /**
   * Phone-check failures that keep the site under the bar whatever else it scores (a visible loading counter, or a
   * home page with no content). Kept apart from `capped`, which is stored with a fixed set of values in the quality log.
   */
  blockers: string[];
  blueprint: string;
  criteria: CriterionResult[];
};

type Partial3 = { score: number; detail: string; fix?: string; sections?: string[]; missing?: string[] };
type Ctx = { f: SiteFeatures; input: VideoScoreInput; home: readonly ModelSection[] };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const uniq = <T,>(list: readonly T[]) => [...new Set(list)];
const nodeIn = (ctx: Ctx, sectionId: string) => ctx.f.nodesBySection.get(sectionId) ?? [];
const homeNodes = (ctx: Ctx) => ctx.home.flatMap((s) => nodeIn(ctx, s.id));
const hasType = (nodes: readonly FlatNode[], ...types: string[]) => nodes.some((n) => types.includes(n.node.type));
const widgetOf = (n: CompositionNode) => (n.type === "widget" ? (n.text ?? "").trim() : "");

/* ------------------------------------------------------------------------------------------------------------ */
/* Colour helpers                                                                                               */
/* ------------------------------------------------------------------------------------------------------------ */

function hexToRgb(value: string | undefined): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split("").map((c) => c + c).join("") : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Hue (0-360) and saturation (0-1) of a hex colour, or null when it is not a hex colour. */
function hueSat(value: string | undefined): { hue: number; sat: number; light: number } | null {
  const rgb = hexToRgb(value);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0, light };
  const sat = d / (1 - Math.abs(2 * light - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat, light };
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Blueprint component → composition primitives                                                                 */
/* ------------------------------------------------------------------------------------------------------------ */

/** Which layout primitives deliver each scroll story the blueprints name. */
export const STORY_PRIMITIVES: Readonly<Record<string, readonly string[]>> = {
  ScrubVideo: ["scene", "scrub_sequence"],
  ScrubSequence: ["scrub_sequence"],
  DescentStage: ["scroll_chapters", "scene"],
  FloorSelector: ["building_explorer", "tour_360"],
  BeforeAfterSlider: ["before_after_slider", "compare"],
  ScrollChapters: ["scroll_chapters", "sticky_split_story"],
  ParallaxLayers: ["parallax_layers"],
};
const STORY_ANY = ["scene", "scrub_sequence", "scroll_chapters", "sticky_split_story", "parallax_layers", "before_after_slider", "building_explorer", "compare"];

/** Which primitives (or widgets, written `widget:<name>`) deliver each signature tool. */
export const TOOL_PRIMITIVES: Readonly<Record<string, readonly string[]>> = {
  BookingPicker: ["widget:booking_form", "widget:quote_calculator", "widget:enquiry_form"],
  ConfiguratorSwitch: ["toggle", "tab_group", "tabs", "service_tier_fader", "dial_selector", "collection_row", "widget:service_estimator", "widget:quote_calculator"],
  GuidedTriage: ["tab_group", "tabs", "accordion", "faq_accordion", "dial_selector", "widget:quote_calculator", "widget:service_estimator"],
  FilterGrid: ["tab_group", "tabs", "gallery", "collection_row"],
  QuoteCalculator: ["widget:quote_calculator", "widget:service_estimator"],
  BeforeAfterSlider: ["before_after_slider", "compare"],
  ScrollChapters: ["scroll_chapters", "scrub_sequence", "sticky_split_story"],
  FloorSelector: ["building_explorer", "tour_360"],
};
const INTERACTIVE = new Set([
  "tabs", "toggle", "accordion", "compare", "before_after_slider", "faq_accordion", "tab_group", "scroll_chapters", "spin_viewer",
  "collection_row", "lens_magnifier", "sticky_split_story", "service_tier_fader", "scrub_sequence", "dial_selector", "model_3d_viewer",
  "tour_360", "building_explorer",
]);

const typeKey = (n: CompositionNode) => (n.type === "widget" ? `widget:${widgetOf(n)}` : n.type);

/* ------------------------------------------------------------------------------------------------------------ */
/* Criteria                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------ */

function heroNodes(ctx: Ctx): { section: ModelSection | undefined; nodes: FlatNode[] } {
  const section = ctx.home[0];
  return { section, nodes: section ? nodeIn(ctx, section.id) : [] };
}

const maxHeadingSize = (nodes: readonly FlatNode[]) =>
  nodes.filter((n) => n.node.type === "heading").reduce((m, n) => Math.max(m, n.node.style?.size ?? 0), 0);

function heroCinematic(ctx: Ctx): Partial3 {
  const { section, nodes } = heroNodes(ctx);
  if (!section) return { score: 0, detail: "The home page has no sections.", fix: "Build a home page that opens with a full-screen hero.", missing: ["hero"] };
  const legacy = nodes.length === 0;
  const media = ctx.f.media.filter((m) => m.sectionId === section.id);
  const backdrop = hasType(nodes, "scene", "scrub_sequence", "parallax_layers", "shader_field") || media.length > 0;
  const size = maxHeadingSize(nodes);
  const moving = nodes.some((n) => (n.node.motion && n.node.motion.kind !== "none") || n.node.type === "scene" || n.node.type === "scrub_sequence" || n.node.type === "parallax_layers" || n.node.type === "shader_field") || media.some((m) => m.kind === "video");
  const cta = nodes.some((n) => (n.node.type === "button" || n.node.type === "link") && !!n.node.href) || nodes.some((n) => !!n.node.primaryCta?.href) || (section.components ?? []).some((c) => !!c.linkUrl);
  const eyebrow = nodes.some((n) => n.node.type !== "heading" && n.node.style?.uppercase === true && (n.node.style.size ?? 14) <= 16);

  const parts = [
    backdrop ? 0.3 : 0,
    size >= LIMITS.displayMinPx ? 0.25 : size >= LIMITS.h2MinPx ? 0.12 : 0,
    moving ? 0.2 : 0,
    cta ? 0.15 : 0,
    eyebrow ? 0.1 : 0,
  ];
  let score = parts.reduce((a, b) => a + b, 0);
  if (legacy) score = Math.min(score, 0.4);
  const gaps: string[] = [];
  if (!backdrop) gaps.push("a full-bleed picture or video behind the opening");
  if (size < LIMITS.displayMinPx) gaps.push(`one large headline (at least ${LIMITS.displayMinPx}px)`);
  if (!moving) gaps.push("motion on the opening (headline rise or a moving backdrop)");
  if (!cta) gaps.push("a clear action button in the opening");
  if (!eyebrow) gaps.push("a small uppercase label above the headline");
  if (legacy) gaps.push("a designed layout (the opening has no layout, only plain fields)");
  return {
    score,
    detail: gaps.length ? `The opening lacks ${gaps.join("; ")}.` : "The opening has a full-bleed backdrop, a display headline, motion and an action.",
    fix: gaps.length ? `Rebuild the opening with ${gaps.join(", ")}.` : "",
    sections: score < 1 ? [section.id] : [],
  };
}

function scrollStory(ctx: Ctx): Partial3 {
  const nodes = homeNodes(ctx);
  const expected = STORY_PRIMITIVES[ctx.input.blueprint.scrollComponent] ?? STORY_ANY;
  const heroId = ctx.home[0]?.id;
  const story = nodes.filter((n) => n.sectionId !== heroId && STORY_ANY.includes(n.node.type));
  if (!story.length) return { score: 0, detail: "No scroll-driven story on the home page.", fix: `Add the trade's scroll story (${ctx.input.blueprint.scrollComponent}) as one pinned or chaptered section.`, missing: ["signature-moment"] };
  let score = 0.5;
  const matches = story.some((n) => expected.includes(n.node.type));
  if (matches) score += 0.3;
  const chapters = story.some((n) => (n.node.type === "scroll_chapters" && (n.node.children?.length ?? 0) >= 2) || (n.node.type === "scrub_sequence" && (n.node.children?.length ?? 0) >= 2) || n.node.type === "scene" || n.node.type === "parallax_layers" || n.node.type === "before_after_slider" || n.node.type === "sticky_split_story" || n.node.type === "building_explorer");
  if (chapters) score += 0.2;
  const notes: string[] = [];
  const pinned = nodes.filter((n) => (n.node.type === "scene" && n.node.scrub === true) || n.node.type === "scrub_sequence");
  const offenders: string[] = [];
  if (pinned.length > 1) {
    score -= 0.3;
    notes.push("more than one pinned scrub on the page (the bar is one hero moment)");
    offenders.push(...pinned.slice(1).map((n) => n.sectionId));
  }
  const nested = pinned.filter((n) => n.insideChapters);
  if (nested.length) {
    score -= 0.3;
    notes.push("a pinned scrub sits inside scroll chapters");
    offenders.push(...nested.map((n) => n.sectionId));
  }
  const bad = !matches ? [`the trade's story (${ctx.input.blueprint.scrollComponent}) is not the one used`] : [];
  const all = [...bad, ...notes];
  return {
    score: clamp01(score),
    detail: all.length ? `Scroll story found, but ${all.join("; ")}.` : "A scroll-driven story is in place and matches the trade.",
    fix: all.length ? `Keep a single hero scroll moment and use ${ctx.input.blueprint.scrollComponent} for this trade.` : "",
    sections: uniq(offenders),
    missing: !matches && !offenders.length ? ["signature-moment"] : [],
  };
}

function scrollMotion(ctx: Ctx): Partial3 {
  const rest = ctx.home.slice(1);
  if (!rest.length) return { score: 0, detail: "There are no sections after the opening.", fix: "Add the page's sections.", missing: ["sections"] };
  const animated = (s: ModelSection) => nodeIn(ctx, s.id).some((n) => (n.node.motion && n.node.motion.kind !== "none") || STORY_ANY.includes(n.node.type) || n.node.countUp === true);
  const still = rest.filter((s) => !animated(s));
  const share = (rest.length - still.length) / rest.length;
  const nodes = homeNodes(ctx).filter((n) => n.node.motion);
  const badEase = nodes.filter((n) => n.node.motion!.easing === "linear");
  const slow = nodes.filter((n) => (n.node.motion!.durationMs ?? 0) > LIMITS.maxDurationMs);
  const split = nodes.filter((n) => n.node.motion!.kind === "split").length;
  const depth = nodes.filter((n) => n.node.motion!.kind === "depth").length;
  const overuse = split > 1 || depth > 1;
  const clean = badEase.length === 0 && slow.length === 0 && !overuse;
  const score = clamp01(share / LIMITS.revealShare) * 0.7 + (clean ? 0.3 : badEase.length || slow.length ? 0.1 : 0.2);
  const notes: string[] = [];
  if (share < LIMITS.revealShare) notes.push(`${Math.round(share * 100)}% of sections animate in (target ${Math.round(LIMITS.revealShare * 100)}%)`);
  if (badEase.length) notes.push("linear easing is used outside scrubbing");
  if (slow.length) notes.push(`an animation runs longer than ${LIMITS.maxDurationMs} ms`);
  if (overuse) notes.push("headline split or depth zoom is used more than once on the page");
  return {
    score: clamp01(score),
    detail: notes.length ? notes.join("; ") + "." : "Sections rise in on scroll with ease-out timing.",
    fix: notes.length ? "Give each section a short ease-out rise or fade on scroll, and keep split and depth effects to one each." : "",
    sections: uniq([...still.map((s) => s.id), ...badEase.map((n) => n.sectionId), ...slow.map((n) => n.sectionId)]),
  };
}

function signatureTool(ctx: Ctx): Partial3 {
  const tool = ctx.input.blueprint.signatureTool;
  const wanted = TOOL_PRIMITIVES[tool.component] ?? [];
  const all = ctx.f.nodes;
  const hit = ctx.home.find((s) => nodeIn(ctx, s.id).some((n) => wanted.includes(typeKey(n.node))));
  const exact = hit !== undefined;
  const otherInteractive = !exact && all.some((n) => INTERACTIVE.has(n.node.type) || widgetOf(n.node) === "quote_calculator" || widgetOf(n.node) === "service_estimator");
  if (!exact && !otherInteractive) return { score: 0, detail: `No interactive tool. This trade's centrepiece is "${tool.name}".`, fix: `Add the signature tool "${tool.name}" (${tool.component}) high on the home page.`, missing: ["signature-tool"] };
  if (!exact) return { score: 0.4, detail: `An interactive block exists, but not this trade's tool "${tool.name}".`, fix: `Replace it with "${tool.name}" (${tool.component}).`, missing: ["signature-tool"] };
  const idx = ctx.home.findIndex((s) => s.id === hit!.id);
  const early = idx <= Math.ceil(ctx.home.length * 0.7);
  return {
    score: early ? 1 : 0.75,
    detail: early ? `"${tool.name}" is on the home page.` : `"${tool.name}" is present but sits near the bottom of the page.`,
    fix: early ? "" : `Move "${tool.name}" up, before the closing sections.`,
    sections: early ? [] : [hit!.id],
  };
}

const FORM_WIDGETS = new Set(["enquiry_form", "booking_form", "quote_calculator"]);
const FORM_KINDS = new Set(["quote", "booking", "contact"]);

function leadCapture(ctx: Ctx): Partial3 {
  const formSection = (s: ModelSection) => FORM_KINDS.has(s.kind) || nodeIn(ctx, s.id).some((n) => FORM_WIDGETS.has(widgetOf(n.node)));
  const onHome = ctx.home.filter(formSection);
  const anywhere = ctx.f.nodes.some((n) => FORM_WIDGETS.has(widgetOf(n.node))) || (ctx.input.site.sections.some((s) => FORM_KINDS.has(s.kind)));
  if (!anywhere) return { score: 0, detail: "There is no enquiry, booking or quote form anywhere on the site.", fix: "Add a working enquiry or booking form and link the opening button to it.", missing: ["lead"] };
  let score = onHome.length ? 0.5 : 0.3;
  const { nodes } = heroNodes(ctx);
  const hrefs = nodes.flatMap((n) => [n.node.href, n.node.primaryCta?.href, n.node.secondaryCta?.href]).filter((h): h is string => typeof h === "string" && h.trim().length > 0);
  const real = (h: string) => /^(#[\w-]+|\/[\w/-]*|tel:|mailto:|https:\/\/)/i.test(h) && h.trim() !== "#";
  const heroLinked = hrefs.some(real);
  if (heroLinked) score += 0.25;
  const n = ctx.home.length;
  const closing = ctx.home.slice(Math.max(0, n - 3)).some(formSection);
  if (closing) score += 0.25;
  const broken = ctx.f.nodes.flatMap((x) => [x.node.href, x.node.primaryCta?.href, x.node.secondaryCta?.href]).filter((h): h is string => typeof h === "string" && /^(#|javascript:|)$/i.test(h.trim()));
  if (broken.length) score -= 0.15;
  const gaps: string[] = [];
  if (!onHome.length) gaps.push("the form is not on the home page");
  if (!heroLinked) gaps.push("the opening button does not lead to it");
  if (!closing) gaps.push("the page does not close with it");
  if (broken.length) gaps.push("some buttons link to nothing");
  return {
    score: clamp01(score),
    detail: gaps.length ? `A form exists, but ${gaps.join("; ")}.` : "A working form is reachable from the opening and closes the page.",
    fix: gaps.length ? "Put the working form on the home page, link the opening button to it and close the page with it. Give every button a real link." : "",
    sections: [],
    missing: !onHome.length ? ["lead"] : [],
  };
}

function ctaBar(ctx: Ctx): Partial3 {
  const bar = ctx.f.nodes.find((n) => n.node.type === "mobile_sticky_bar");
  const kind = ctx.input.site.sections.find((s) => s.kind === "sticky_cta");
  if (bar && (bar.node.primaryCta?.href || bar.node.primaryCta?.label)) return { score: 1, detail: "A sticky call-to-action bar is present." };
  if (bar || kind) return { score: 0.6, detail: "A sticky bar exists but its main button is incomplete.", fix: "Give the sticky bar one clear label and link.", sections: [(bar ?? { sectionId: kind!.id }).sectionId] };
  return { score: 0, detail: "No sticky call-to-action bar for phones.", fix: "Add a bottom bar with one action (call, book or get a quote).", missing: ["cta-bar"] };
}

const BANNED_DISPLAY = new Set(["inter", "geist", "space grotesk", "roboto", "arial", "helvetica", "system-ui", "sans-serif"]);
const famOf = (value: string) => value.split(",")[0]!.replace(/["']/g, "").trim().toLowerCase();

function typeRules(ctx: Ctx): Partial3 {
  const nodes = ctx.f.nodes;
  const themeFonts = ctx.input.site.theme?.fonts ?? [];
  const nodeFonts = nodes.map((n) => n.node.style?.font).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const fams = uniq([...themeFonts, ...nodeFonts].map(famOf).filter(Boolean));
  const checks: { ok: boolean; note: string; sections: string[] }[] = [];
  if (fams.length) {
    checks.push({ ok: fams.length <= LIMITS.maxFonts, note: `${fams.length} font families are used (limit ${LIMITS.maxFonts})`, sections: [] });
    const display = famOf(themeFonts[0] ?? "") || famOf(nodes.find((n) => n.node.type === "heading" && n.node.style?.font)?.node.style?.font ?? "");
    if (display) checks.push({ ok: !BANNED_DISPLAY.has(display), note: `the display font "${display}" is a default look`, sections: [] });
  }
  const headings = nodes.filter((n) => n.node.type === "heading");
  const display = headings.filter((n) => (n.node.level ?? 2) === 1 || (n.node.style?.size ?? 0) >= LIMITS.displayMinPx);
  const h1Small = headings.filter((n) => (n.node.level ?? 2) === 1 && (n.node.style?.size ?? 0) < LIMITS.displayMinPx);
  if (headings.some((n) => n.node.style?.size !== undefined)) checks.push({ ok: h1Small.length === 0, note: `a main headline is under ${LIMITS.displayMinPx}px`, sections: h1Small.map((n) => n.sectionId) });
  const h2Small = headings.filter((n) => (n.node.level ?? 2) === 2 && n.node.style?.size !== undefined && n.node.style.size < LIMITS.h2MinPx);
  if (headings.some((n) => (n.node.level ?? 2) === 2 && n.node.style?.size !== undefined)) checks.push({ ok: h2Small.length === 0, note: `a section heading is under ${LIMITS.h2MinPx}px`, sections: h2Small.map((n) => n.sectionId) });
  const loose = display.filter((n) => (n.node.style?.lineHeight ?? 0) > LIMITS.displayMaxLineHeight);
  if (display.some((n) => n.node.style?.lineHeight !== undefined)) checks.push({ ok: loose.length === 0, note: `a display headline has loose line spacing (over ${LIMITS.displayMaxLineHeight})`, sections: loose.map((n) => n.sectionId) });
  const small = nodes.filter((n) => n.node.type === "text" && n.node.style?.size !== undefined && n.node.style.size < LIMITS.bodyMinPx && n.node.style.uppercase !== true && n.node.style.size >= 8);
  const body = nodes.filter((n) => n.node.type === "text" && n.node.style?.size !== undefined && n.node.style.uppercase !== true);
  if (body.length) checks.push({ ok: small.length === 0, note: `body text is under ${LIMITS.bodyMinPx}px`, sections: small.map((n) => n.sectionId) });
  if (!checks.length) return { score: 0.5, detail: "No font or size information to judge.", fix: "Set a display font, a body font and explicit heading sizes.", sections: ctx.home.slice(0, 1).map((s) => s.id) };
  const failed = checks.filter((c) => !c.ok);
  return {
    score: (checks.length - failed.length) / checks.length,
    detail: failed.length ? `${failed.map((c) => c.note).join("; ")}.` : "Two families at most, a display headline, readable body text.",
    fix: failed.length ? "Use one display and one body family from the trade's pairing, size the main headline at 44px or more and keep body text at 16px or more." : "",
    sections: uniq(failed.flatMap((c) => c.sections)),
  };
}

function paletteRules(ctx: Ctx): Partial3 {
  const p = ctx.input.site.theme?.palette ?? {};
  const checks: { ok: boolean; note: string; sections: string[] }[] = [];
  const pair = (a: string | undefined, b: string | undefined, min: number, note: string) => {
    if (!a || !b) return;
    const r = contrastRatio(a, b);
    if (r !== null) checks.push({ ok: r >= min, note: `${note} (${r.toFixed(1)}:1)`, sections: [] });
  };
  pair(p.text, p.base, LIMITS.minAccentContrast, "text on the base colour is hard to read");
  pair(p.onAccent, p.accent, LIMITS.minAccentContrast, "text on the accent colour is hard to read");
  const base = p.base?.trim().toLowerCase();
  if (base) checks.push({ ok: base !== "#fff" && base !== "#ffffff" && base !== "#000" && base !== "#000000", note: "the page base is pure white or pure black", sections: [] });
  if (p.accent && p.base) {
    const a = hueSat(p.accent);
    const b = hueSat(p.base);
    if (a && b) checks.push({ ok: !(a.hue >= 255 && a.hue <= 295 && a.sat > 0.4 && b.light < 0.12), note: "purple accent on a black base is the default AI look", sections: [] });
  }
  // Per-node colour pairs, where a layout sets both.
  const nodes = ctx.f.nodes;
  const weak = nodes.filter((n) => {
    const fg = n.node.style?.color;
    const bg = n.node.style?.background;
    if (!fg || !bg) return false;
    const r = contrastRatio(fg, bg);
    const large = (n.node.style?.size ?? 16) >= 24;
    return r !== null && r < (large ? 3 : LIMITS.minAccentContrast);
  });
  if (nodes.some((n) => n.node.style?.color && n.node.style?.background)) checks.push({ ok: weak.length === 0, note: "some text does not meet contrast on its own background", sections: weak.map((n) => n.sectionId) });
  // Rainbow: too many distinct saturated hues across node colours.
  const hues: number[] = [];
  for (const n of nodes) {
    for (const c of [n.node.style?.color, n.node.style?.background, n.node.style?.borderColor, n.node.style?.gradientTo]) {
      const hs = hueSat(c);
      if (hs && hs.sat > 0.4 && hs.light > 0.12 && hs.light < 0.9 && !hues.some((h) => Math.min(Math.abs(h - hs.hue), 360 - Math.abs(h - hs.hue)) < 30)) hues.push(hs.hue);
    }
  }
  if (hues.length) checks.push({ ok: hues.length <= LIMITS.maxChromaticHues, note: `${hues.length} different bright colours are used (the bar is one accent)`, sections: [] });
  // Gradients are scrims over media only.
  const gradients = nodes.filter((n) => n.node.style?.gradientTo && !["scene", "shader_field", "parallax_layers"].includes(n.node.type) && !(n.node.children ?? []).some((c) => c.type === "media"));
  if (nodes.some((n) => n.node.style?.gradientTo)) checks.push({ ok: gradients.length === 0, note: "a gradient is used as decoration (only scrims over pictures are allowed)", sections: gradients.map((n) => n.sectionId) });
  if (!checks.length) return { score: 0.5, detail: "No palette information to judge.", fix: "Set the trade palette: base, surface, accent, text and muted.", sections: [] };
  const failed = checks.filter((c) => !c.ok);
  return {
    score: (checks.length - failed.length) / checks.length,
    detail: failed.length ? `${failed.map((c) => c.note).join("; ")}.` : "One accent, readable contrast, no default palette.",
    fix: failed.length ? "Use the trade's palette: one accent, text that passes 4.5:1 on its background, a tinted base and gradients only as scrims." : "",
    sections: uniq(failed.flatMap((c) => c.sections)),
  };
}

const PLACEHOLDER_IMAGE = /(placeholder|placehold\.co|via\.placeholder|dummyimage|picsum\.photos|lorempixel|loremflickr|placekitten|placeimg|fakeimg|example\.(com|org)|\/placeholder|lorem)/i;
const STOCK_IMAGE = /(unsplash\.com|images\.pexels\.com|pexels\.com|pixabay\.com|shutterstock|istockphoto|gettyimages|stock\.adobe|depositphotos|freepik|source\.unsplash)/i;
const BAD_ALT = /^(image|photo|picture|img|banner|hero|untitled|\d+|[\w-]+\.(jpe?g|png|webp|avif|gif|mp4))$/i;

function images(ctx: Ctx): Partial3 {
  const homeIds = new Set(ctx.home.map((s) => s.id));
  const homeMedia = ctx.f.media.filter((m) => homeIds.has(m.sectionId));
  const distinct = new Set(homeMedia.map((m) => m.ref)).size;
  const count = clamp01(distinct / LIMITS.minHomeImages);
  const all = ctx.f.media;
  const placeholders = all.filter((m) => PLACEHOLDER_IMAGE.test(m.ref));
  const stock = all.filter((m) => STOCK_IMAGE.test(m.ref));
  const noAlt = all.filter((m) => m.kind === "image" && (m.alt.trim().length < 4 || BAD_ALT.test(m.alt.trim())) && m.sectionId !== "");
  const unsized = all.filter((m) => !m.nodeSized);
  const insecure = all.filter((m) => /^http:\/\//i.test(m.ref));
  const penalties = (placeholders.length ? 0.4 : 0) + (stock.length ? 0.3 : 0) + (insecure.length ? 0.1 : 0);
  const altShare = all.length ? 1 - noAlt.length / all.length : 1;
  const sizedShare = all.length ? 1 - unsized.length / all.length : 1;
  const score = clamp01(count * 0.4 + altShare * 0.25 + sizedShare * 0.15 + 0.2 - penalties);
  const notes: string[] = [];
  if (distinct < LIMITS.minHomeImages) notes.push(`${distinct} of ${LIMITS.minHomeImages} pictures on the home page`);
  if (placeholders.length) notes.push(`${placeholders.length} placeholder picture(s)`);
  if (stock.length) notes.push(`${stock.length} stock picture(s) (work photos must be the owner's own)`);
  if (noAlt.length) notes.push(`${noAlt.length} picture(s) without a useful description`);
  if (unsized.length) notes.push(`${unsized.length} picture(s) without a reserved size`);
  if (insecure.length) notes.push("pictures loaded over http");
  return {
    score,
    detail: notes.length ? `${notes.join("; ")}.` : `${distinct} pictures on the home page, all described and sized.`,
    fix: notes.length ? "Use the owner's real photos, describe each in a few words, reserve a size for each and remove placeholders and stock pictures. If the owner has no photos yet, leave a clearly marked slot." : "",
    sections: uniq([...placeholders, ...stock, ...noAlt, ...unsized, ...insecure].map((m) => m.sectionId)),
    missing: distinct < LIMITS.minHomeImages ? ["photos"] : [],
  };
}

const COMPONENT_FAMILY: Readonly<Record<string, readonly string[]>> = {
  CollectionRow: ["collection_row", "offer_card", "list", "grid", "card", "sticky_split_story", "tabs", "tab_group", "accordion"],
  Gallery: ["gallery", "before_after_slider", "media", "marquee"],
  FaqAccordion: ["faq_accordion", "accordion"],
  LeadForm: ["widget:enquiry_form", "widget:booking_form", "widget:quote_calculator"],
  ServiceAreaList: ["list", "text", "widget:contact_details", "widget:direct_contact"],
  StatCounter: ["countUp"],
  FilterGrid: ["tabs", "tab_group", "gallery"],
  BentoHud: ["grid", "card"],
  GlassCardStack: ["card", "parallax_layers"],
  BeforeAfterSlider: ["before_after_slider", "compare"],
  ScrollChapters: ["scroll_chapters", "sticky_split_story"],
  ScrubVideo: ["scene", "scrub_sequence"], ScrubSequence: ["scrub_sequence"], ParallaxLayers: ["parallax_layers"],
  ConfiguratorSwitch: ["toggle", "tab_group", "tabs", "service_tier_fader", "dial_selector"], BookingPicker: ["widget:booking_form"],
  QuoteCalculator: ["widget:quote_calculator"], GuidedTriage: ["tab_group", "tabs", "accordion", "dial_selector"],
};

function sectionRhythm(ctx: Ctx): Partial3 {
  const n = ctx.home.length;
  const notes: string[] = [];
  let score = 0;
  const countOk = n >= LIMITS.minHomeSections && n <= LIMITS.maxHomeSections;
  score += countOk ? 0.25 : n >= 4 ? 0.1 : 0;
  if (!countOk) notes.push(`${n} sections on the home page (target ${LIMITS.minHomeSections} to ${LIMITS.maxHomeSections})`);
  const sig = ctx.home.map((s) => {
    const root = nodeIn(ctx, s.id)[0]?.node;
    return root ? `${root.type}:${(root.children ?? []).slice(0, 3).map((c) => c.type).join(",")}` : `kind:${s.kind}`;
  });
  const runs: string[] = [];
  for (let i = 2; i < sig.length; i++) if (sig[i] === sig[i - 1] && sig[i] === sig[i - 2]) runs.push(ctx.home[i]!.id);
  score += runs.length ? 0 : 0.25;
  if (runs.length) notes.push("three sections in a row share the same structure");
  const withHeading = ctx.home.filter((s, i) => i === 0 || !!s.heading?.trim() || nodeIn(ctx, s.id).some((x) => x.node.type === "heading"));
  score += (withHeading.length / Math.max(1, n)) * 0.15;
  if (withHeading.length < n) notes.push("some sections have no heading");
  // Blueprint coverage: every non-optional section the trade calls for has its primitive somewhere on the home page.
  const homeKeys = new Set(homeNodes(ctx).map((x) => typeKey(x.node)));
  if (homeNodes(ctx).some((x) => x.node.countUp === true)) homeKeys.add("countUp");
  const required = ctx.input.blueprint.sections.filter((s) => !s.omitIfMissing && s.id !== "hero" && COMPONENT_FAMILY[s.component] && !s.id.startsWith("signature") && !s.id.startsWith("tool") && s.component !== "ProofSlot" && s.component !== "DisclaimerBlock");
  const absent = required.filter((s) => !(COMPONENT_FAMILY[s.component] ?? []).some((k) => homeKeys.has(k) || ctx.input.site.sections.some((x) => x.kind === s.id)));
  score += required.length ? (1 - absent.length / required.length) * 0.25 : 0.25;
  if (absent.length) notes.push(`missing ${absent.map((s) => s.label.toLowerCase()).join(", ")}`);
  const formIdx = ctx.home.findIndex((s) => FORM_KINDS.has(s.kind) || nodeIn(ctx, s.id).some((x) => FORM_WIDGETS.has(widgetOf(x.node))));
  const lateForm = formIdx >= 0 && formIdx >= n - 3;
  score += lateForm ? 0.1 : 0;
  if (!lateForm) notes.push("the enquiry section is not near the end");
  return {
    score: clamp01(score),
    detail: notes.length ? `${notes.join("; ")}.` : "Section count, variety and order follow the trade's blueprint.",
    fix: notes.length ? "Follow the trade's section order, vary the structure of neighbouring sections and end with the enquiry section." : "",
    sections: runs,
    missing: absent.map((s) => s.id),
  };
}

function mobileLayout(ctx: Ctx): Partial3 {
  const nodes = ctx.f.nodes;
  const grids = nodes.filter((n) => (n.node.type === "grid" || n.node.type === "row") && (n.node.style?.columns ?? 1) > 1);
  const stuck = grids.filter((n) => !n.node.responsive?.mobile || (n.node.responsive.mobile.columns ?? 99) > 1 && n.node.type === "grid");
  const hasBar = hasType(nodes, "mobile_sticky_bar");
  const small = nodes.filter((n) => n.node.type === "text" && n.node.responsive?.mobile?.size !== undefined && n.node.responsive.mobile.size < LIMITS.bodyMinPx);
  const { nodes: hero } = heroNodes(ctx);
  const heroPad = hero.filter((n) => (n.node.style?.padding ?? 0) > 96 && !n.node.responsive?.mobile);
  const notes: string[] = [];
  let score = 0;
  score += grids.length ? (1 - stuck.length / grids.length) * 0.4 : 0.4;
  if (stuck.length) notes.push(`${stuck.length} multi-column block(s) do not collapse to one column on phones`);
  score += hasBar ? 0.25 : 0;
  if (!hasBar) notes.push("no phone action bar");
  score += small.length ? 0 : 0.2;
  if (small.length) notes.push(`text under ${LIMITS.bodyMinPx}px on phones`);
  score += heroPad.length ? 0 : 0.15;
  if (heroPad.length) notes.push("the opening keeps oversized padding on phones");
  return {
    score: clamp01(score),
    detail: notes.length ? `${notes.join("; ")}.` : "Columns collapse, text stays readable and a phone action bar is present.",
    fix: notes.length ? "Add phone overrides: one column, body text of at least 16px, tighter padding, and a bottom action bar." : "",
    sections: uniq([...stuck, ...small, ...heroPad].map((n) => n.sectionId)),
    missing: hasBar ? [] : ["cta-bar"],
  };
}

const AI_PHRASES: readonly RegExp[] = [
  /\belevate\b/i, /\bseamless(?:ly)?\b/i, /\bunlock\b/i, /\bunleash\b/i, /\bgame[- ]?changer\b/i, /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i, /\bin today'?s fast[- ]paced\b/i, /\bit'?s not (?:just )?[^.]{1,40}, it'?s\b/i,
  /\bdelve\b/i, /\btapestry\b/i, /\bwelcome to our website\b/i, /\byour trusted partner\b/i, /\bone[- ]stop[- ]shop\b/i,
  /\bworld[- ]class\b/i, /\bwe pride ourselves\b/i, /\bpassionate team\b/i, /\bsecond to none\b/i, /\btake (?:it|your \w+) to the next level\b/i,
];
const EM_DASH = /\u2014/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2728}]/u;
const CHECK_BULLET = /[\u2713\u2714\u2705]/;

function antiAiLint(ctx: Ctx): Partial3 {
  const hits: { note: string; weight: number; sections: string[] }[] = [];
  const bySection = (re: RegExp | ((t: string) => boolean)) => uniq(ctx.f.texts.filter((t) => (typeof re === "function" ? re(t.text) : re.test(t.text))).map((t) => t.id));
  const phrase = bySection((t) => AI_PHRASES.some((re) => re.test(t)));
  if (phrase.length) hits.push({ note: "stock marketing phrases", weight: 0.2, sections: phrase });
  const dash = bySection(EM_DASH);
  if (dash.length) hits.push({ note: "em dashes in copy", weight: 0.1, sections: dash });
  const emoji = bySection(EMOJI);
  if (emoji.length) hits.push({ note: "emoji in copy", weight: 0.15, sections: emoji });
  const check = bySection(CHECK_BULLET);
  if (check.length) hits.push({ note: "checkmark bullet lists", weight: 0.1, sections: check });
  const nodes = ctx.f.nodes;
  const orbs = nodes.filter((n) => /radial-gradient|conic-gradient/i.test(String(n.node.style?.background ?? "")));
  if (orbs.length) hits.push({ note: "glow orb or dotted gradient backgrounds", weight: 0.2, sections: uniq(orbs.map((n) => n.sectionId)) });
  const second = ctx.home[1];
  const threeCards = second
    ? nodeIn(ctx, second.id).filter((n) => (n.node.type === "grid" || n.node.type === "row") && (n.node.children?.length ?? 0) === 3 && (n.node.children ?? []).every((c) => c.type === "card"))
    : [];
  if (threeCards.length) hits.push({ note: "three feature cards straight after the opening", weight: 0.2, sections: [second!.id] });
  const cards = nodes.filter((n) => n.node.type === "card");
  const shadowed = cards.filter((n) => n.node.style?.shadow && n.node.style.shadow !== "none");
  if (cards.length >= 4 && shadowed.length / cards.length > 0.6) hits.push({ note: "a shadow on nearly every card", weight: 0.1, sections: uniq(shadowed.map((n) => n.sectionId)) });
  const radii = nodes.map((n) => n.node.style?.radius).filter((r): r is number => typeof r === "number" && r > 0);
  if (radii.length >= 8 && new Set(radii).size === 1 && radii[0]! >= 16) hits.push({ note: "the same large corner radius on everything", weight: 0.1, sections: [] });
  const total = hits.reduce((a, h) => a + h.weight, 0);
  return {
    score: clamp01(1 - total * 2),
    detail: hits.length ? `Found ${hits.map((h) => h.note).join("; ")}.` : "No template phrases, emoji, glow orbs or card clichés.",
    fix: hits.length ? "Rewrite the flagged copy in plain, specific words, remove emoji, em dashes, glow backgrounds and the three-card row." : "",
    sections: uniq(hits.flatMap((h) => h.sections)),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function truthFacts(ctx: Ctx): Partial3 {
  const violations = findInventedFacts(ctx.f.texts, ctx.input.intake);
  const corpus = norm([ctx.input.intake.ownerText, ctx.input.intake.description].filter(Boolean).join(" "));
  const extra: { id: string; note: string }[] = [];
  for (const f of ctx.f.nodes) {
    const n = f.node;
    if (n.type === "quote" && n.text && !/\[Add your/i.test(n.text) && !corpus.includes(norm(n.text))) extra.push({ id: f.sectionId, note: "a testimonial the owner did not supply" });
    if (n.countUp === true && n.text) {
      const figure = norm(n.text);
      const own = [ctx.input.intake.rating, ctx.input.intake.reviewCount, ctx.input.intake.yearsInBusiness, ctx.input.intake.foundedYear].filter((v) => v !== null && v !== undefined).map((v) => norm(String(v)));
      if (!own.some((v) => figure.includes(v)) && !corpus.includes(figure)) extra.push({ id: f.sectionId, note: `the count-up figure "${n.text}" is not one the owner gave` });
    }
  }
  const total = violations.length + extra.length;
  if (!total) return { score: 1, detail: "Every phone, price, rating, count and claim is the owner's own." };
  const named = [...violations.slice(0, 3).map((v) => `${v.kind} "${v.match}"`), ...extra.slice(0, 3).map((e) => e.note)];
  return {
    score: 0,
    detail: `${total} claim(s) are not from the owner: ${named.join("; ")}.`,
    fix: "Remove or replace each flagged claim with the owner's real fact, or with an [Add your ...] marker.",
    sections: uniq([...violations.map((v) => v.partId), ...extra.map((e) => e.id)]),
  };
}

/** The 390px phone check (G-A5). The eight checks live in mobile-390.ts; this is their one scored criterion. */
function mobile390(ctx: Ctx): Partial3 {
  const r = checkMobile390(ctx.input.site, ctx.f);
  if (!r.findings.length) return { score: 1, detail: "At 390px wide: no loading overlay, no owner button, no sideways scroll, no big gaps, readable hero, one contact block, nothing covered, real content." };
  const first = r.findings.slice().sort((a, b) => Number(b.hard) - Number(a.hard))[0]!;
  const more = r.findings.length - 1;
  return {
    score: r.score,
    detail: `${first.detail[0]!.toUpperCase()}${first.detail.slice(1)}${more > 0 ? ` ${more} more phone problem(s) found.` : ""}`,
    fix: r.findings.map((x) => x.fix).join(" "),
    sections: uniq(r.findings.flatMap((x) => x.sections)),
  };
}

const CRITERIA: readonly [CriterionId, (ctx: Ctx) => Partial3][] = [
  ["hero_cinematic", heroCinematic], ["scroll_story", scrollStory], ["scroll_motion", scrollMotion], ["signature_tool", signatureTool],
  ["lead_capture", leadCapture], ["cta_bar", ctaBar], ["type_rules", typeRules], ["palette_rules", paletteRules], ["images", images],
  ["section_rhythm", sectionRhythm], ["mobile_layout", mobileLayout], ["mobile_390", mobile390], ["anti_ai_lint", antiAiLint], ["truth_facts", truthFacts],
];

/** Scores one generated site against the video bar. Pure and deterministic. */
export function scoreVideoBar(input: VideoScoreInput, bar: number = VIDEO_BAR): VideoScore {
  const f = extractFeatures(input.site);
  const ctx: Ctx = { f, input, home: f.home };
  const criteria: CriterionResult[] = CRITERIA.map(([id, run]) => {
    const r = run(ctx);
    const score = clamp01(r.score);
    const weight = CRITERIA_WEIGHTS[id];
    return {
      id, label: CRITERIA_LABELS[id], weight, score: Math.round(score * 100) / 100, points: Math.round(weight * score * 10) / 10,
      met: score >= CRITERION_PASS, detail: r.detail, fix: score >= CRITERION_PASS ? "" : r.fix ?? "", sections: score >= 1 ? [] : r.sections ?? [], missing: score >= 1 ? [] : r.missing ?? [],
    };
  });
  const raw = Math.round(criteria.reduce((a, c) => a + c.weight * c.score, 0));
  const by = (id: CriterionId) => criteria.find((c) => c.id === id)!;
  const capped: VideoScore["capped"] = by("truth_facts").score < 1 ? "invented_facts" : by("lead_capture").score === 0 ? "no_lead_capture" : null;
  const blockers = checkMobile390(input.site, f).findings.filter((x) => x.hard).map((x) => x.id);
  const score = capped || blockers.length ? Math.min(raw, HARD_CAP) : raw;
  return { score, rawScore: raw, bar, passed: score >= bar, capped, blockers, blueprint: input.blueprint.slug, criteria };
}

/** The criteria worth repairing: biggest points lost first, until the lost points could close the gap to the bar. */
export function repairTargets(result: VideoScore): CriterionResult[] {
  const lost = result.criteria.filter((c) => c.score < 1 && (c.fix || c.sections.length || c.missing.length)).map((c) => ({ c, lost: c.weight * (1 - c.score) })).sort((a, b) => b.lost - a.lost);
  const must = result.criteria.filter((c) => (c.id === "truth_facts" && c.score < 1) || (c.id === "lead_capture" && c.score === 0) || (c.id === "mobile_390" && c.score === 0));
  const gap = Math.max(1, result.bar - result.rawScore);
  const picked: CriterionResult[] = [...must];
  let covered = must.reduce((a, c) => a + c.weight * (1 - c.score), 0);
  for (const { c, lost: l } of lost) {
    if (picked.includes(c)) continue;
    if (covered >= gap && picked.length > 0) break;
    picked.push(c);
    covered += l;
  }
  return picked;
}

/** The owner-facing "what to fix", in plain words, worst first. No scores, no jargon. */
export function ownerFixList(result: VideoScore, max = 5): string[] {
  return result.criteria
    .filter((c) => !c.met && c.fix)
    .sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score))
    .slice(0, max)
    .map((c) => `${c.label}: ${c.detail} ${c.fix}`.replace(/\s+/g, " ").trim());
}
