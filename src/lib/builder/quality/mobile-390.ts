/**
 * Phone check at 390px wide: eight deterministic checks on the site model, each tied to a problem seen in Adam's
 * phone video of the Elite build (G-A5). Pure: it reads the composition tree the builder produced, so it needs no
 * browser, no network and no paid service, and it runs on every publish check and inside the quality gate's retry loop.
 *
 * It is one scored criterion (`mobile_390`) of the video-bar scorer. It never publishes, blocks or repairs by itself:
 * the gate (`video-gate.ts`) re-generates only the sections named here, and the publish block (`video-publish-gate.ts`)
 * stops a site that is still under the bar.
 *
 * Two checks are hard (a visible loading counter, no content at all). A hard failure keeps the site under the bar
 * whatever else it scores. Pixel-level image darkness cannot be known from the layout alone, so check 5 judges the
 * hero's declared colours and scrim; the render-based check (scripts/page-sweep.mjs, the QA gate screenshots) covers
 * the pixels.
 */
import type { CompositionNode, NodeStyle } from "@/lib/builder/composition-tree";
import { contrastRatio } from "@/lib/readable-color";
import type { FlatNode, ModelSection, SiteFeatures, SiteModel } from "@/lib/builder/quality/video-site-model";

export const PHONE_WIDTH = 390;
export const PHONE_HEIGHT = 844;

export type Mobile390CheckId =
  | "debug_overlay" | "owner_pill" | "sideways_scroll" | "empty_gaps" | "hero_contrast" | "repeated_contact" | "covered_text" | "no_content";

export type Mobile390Finding = {
  id: Mobile390CheckId;
  /** A hard failure keeps the whole site under the bar. */
  hard: boolean;
  /** Plain words for the owner, starting with "on phones". */
  detail: string;
  /** What to change, in plain words. */
  fix: string;
  sections: string[];
};

export type Mobile390Result = {
  /** The eight checks that were run, in order. */
  checks: readonly Mobile390CheckId[];
  findings: Mobile390Finding[];
  /** 0 to 1. A hard failure is 0; each other failure takes a quarter off. */
  score: number;
  hardFailure: boolean;
};

export const MOBILE_390_CHECKS: readonly Mobile390CheckId[] = [
  "debug_overlay", "owner_pill", "sideways_scroll", "empty_gaps", "hero_contrast", "repeated_contact", "covered_text", "no_content",
];

/** The style a node really has on a 390px screen: its own style with the mobile override on top. */
export const phoneStyle = (n: CompositionNode): NodeStyle => ({ ...(n.style ?? {}), ...(n.responsive?.mobile ?? {}) });
const hiddenOnPhone = (n: CompositionNode) => phoneStyle(n).hidden === true;
const uniq = <T,>(list: readonly T[]) => [...new Set(list)];

/** A visible build/loading counter or leaked placeholder. These must never reach a visitor. */
const DEBUG_TEXT: readonly RegExp[] = [
  /\b\d{1,3}\s?%\s*[\u00b7\u2022|/-]\s*\d+\s*\/\s*\d+/,
  /\bopening surface study\b/i,
  /\b(?:loading|building|composing|generating|rendering)\b[^.]{0,40}\b\d{1,3}\s?%/i,
  /^\s*\d{1,3}\s?%\s*$/,
  /\[object Object\]|\bundefined\b|\bNaN\b/,
];
/** Holding-page wording that means the visitor sees no real home page. */
const HOLDING_TEXT = /\b(this website is (?:being updated|still being built)|site (?:is )?under construction|coming soon)\b/i;
/** The owner's floating "back to builder" control, which a visitor must never see. */
const PILL_TEXT = /^[\s\u2190\u2039<-]*(?:back to )?(?:the )?(?:builder|editor)\b|\bedit (?:this |your )?site\b/i;

const nodeStrings = (n: CompositionNode): string[] => [
  n.text, ...(n.items ?? []), n.primaryCta?.label, n.secondaryCta?.label, ...(n.tabs ?? []).map((t) => t.label),
].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

const hasContent = (flat: readonly FlatNode[]) =>
  flat.some((f) => {
    const n = f.node;
    return nodeStrings(n).length > 0 || !!(n.src ?? n.mediaRef) || !!n.beforeImage || n.type === "widget" || !!n.faqItems?.length || !!n.dialOptions?.length || !!n.floors?.length;
  });

const sectionHasContent = (s: ModelSection, f: SiteFeatures) =>
  !!(s.heading?.trim() || s.subheading?.trim() || s.body?.trim() || s.bgImage || (s.components ?? []).length) || hasContent(f.nodesBySection.get(s.id) ?? []);

/* 1 ------------------------------------------------------------------------------------------------------------ */
function debugOverlay(f: SiteFeatures): Mobile390Finding | null {
  const hit = f.texts.filter((t) => DEBUG_TEXT.some((re) => re.test(t.text)));
  if (!hit.length) return null;
  return {
    id: "debug_overlay", hard: true,
    detail: `on phones, a loading or debug message ("${hit[0]!.text.trim().slice(0, 40)}") is showing on the page.`,
    fix: "Remove the loading counter and any debug text from the page. Visitors must only see the finished website.",
    sections: uniq(hit.map((t) => t.id)),
  };
}

/* 2 ------------------------------------------------------------------------------------------------------------ */
const floating = (n: CompositionNode) => {
  const s = phoneStyle(n);
  return (s.position === "absolute" || s.position === "sticky") && (s.bottom !== undefined || s.right !== undefined || s.left !== undefined);
};
function ownerPill(f: SiteFeatures): Mobile390Finding | null {
  const hasBar = f.nodes.some((x) => x.node.type === "mobile_sticky_bar");
  const named = f.nodes.filter((x) => !hiddenOnPhone(x.node) && nodeStrings(x.node).some((t) => PILL_TEXT.test(t)));
  const overlapping = hasBar
    ? f.nodes.filter((x) => {
        const s = phoneStyle(x.node);
        return x.node.type !== "mobile_sticky_bar" && !hiddenOnPhone(x.node) && floating(x.node) && s.bottom !== undefined && s.bottom <= 96 && (s.zIndex ?? 0) >= 1;
      })
    : [];
  const bad = [...named, ...overlapping];
  if (!bad.length) return null;
  return {
    id: "owner_pill", hard: false,
    detail: named.length
      ? "on phones, an owner-only control (such as a Builder button) is part of the page and would show to visitors."
      : "on phones, a floating button sits on top of the bottom Call/Book bar.",
    fix: "Hide owner controls from visitors and phones, and keep any floating button clear of the bottom action bar.",
    sections: uniq(bad.map((x) => x.sectionId)),
  };
}

/* 3 ------------------------------------------------------------------------------------------------------------ */
const textWidthPerChar = 0.56;
function sidewaysScroll(f: SiteFeatures): Mobile390Finding | null {
  const bad: FlatNode[] = [];
  for (const x of f.nodes) {
    const n = x.node;
    const s = phoneStyle(n);
    if (hiddenOnPhone(n)) continue;
    if ((n.type === "heading" || n.type === "text" || n.type === "button") && n.text && s.size) {
      const longest = Math.max(0, ...n.text.split(/\s+/).map((w) => w.length));
      const room = PHONE_WIDTH - 2 * Math.min(s.paddingX ?? s.padding ?? 16, 60);
      const em = textWidthPerChar + Math.max(0, s.letterSpacing ?? 0);
      if (longest * s.size * em > room && !n.countUp) bad.push(x);
    }
    if (s.position === "absolute" && ((s.left ?? 0) > PHONE_WIDTH - 20 || (s.left ?? 0) < -40 || (s.right ?? 0) < -40 || (s.right ?? 0) > PHONE_WIDTH - 20)) bad.push(x);
    if ((s.maxWidth ?? 0) > 0 && (n.type === "marquee" || n.type === "gallery")) continue;
  }
  if (!bad.length) return null;
  return {
    id: "sideways_scroll", hard: false,
    detail: "on phones, the page can be dragged sideways because a headline word or a positioned block is wider than the screen.",
    fix: "Lower the phone headline size, let long words wrap, and keep positioned blocks inside the 390px screen width.",
    sections: uniq(bad.map((x) => x.sectionId)),
  };
}

/* 4 ------------------------------------------------------------------------------------------------------------ */
const blankHeight = (flat: readonly FlatNode[]): number => {
  let total = 0;
  for (const x of flat) {
    const n = x.node;
    const s = phoneStyle(n);
    if (hiddenOnPhone(n)) continue;
    const empty = (n.type === "spacer" || n.type === "stack" || n.type === "divider") && !(n.children ?? []).length && !nodeStrings(n).length && !(n.src ?? n.mediaRef);
    if (empty) total += s.minHeight ?? (n.type === "spacer" ? s.size ?? 24 : 0);
    if (x.depth === 0 && (n.children ?? []).length) total += 2 * (s.paddingY ?? s.padding ?? 0) + (s.overlap ? 0 : 0);
  }
  return total;
};
function emptyGaps(site: SiteModel, f: SiteFeatures): Mobile390Finding | null {
  const bad = f.home.filter((s) => {
    const flat = f.nodesBySection.get(s.id) ?? [];
    const gap = blankHeight(flat);
    const emptyTall = flat.length > 0 && !hasContent(flat) && (phoneStyle(flat[0]!.node).minHeight ?? 0) > 320;
    return gap >= PHONE_HEIGHT / 2 || emptyTall;
  });
  // Consecutive blank sections add up: more than a full screen of nothing between two pieces of content.
  let run = 0;
  const runIds: string[] = [];
  for (const s of f.home) {
    const flat = f.nodesBySection.get(s.id) ?? [];
    if (flat.length > 0 && !hasContent(flat)) {
      run += Math.max(blankHeight(flat), phoneStyle(flat[0]!.node).minHeight ?? 0);
      runIds.push(s.id);
      if (run > PHONE_HEIGHT) bad.push(...f.home.filter((h) => runIds.includes(h.id)));
    } else {
      run = 0;
      runIds.length = 0;
    }
  }
  void site;
  if (!bad.length) return null;
  return {
    id: "empty_gaps", hard: false,
    detail: "on phones, there is a large empty gap (about half a screen or more of blank space) between sections.",
    fix: "Remove empty spacer blocks, cut the phone padding on those sections, and drop sections that have no content.",
    sections: uniq(bad.map((s) => s.id)),
  };
}

/* 5 ------------------------------------------------------------------------------------------------------------ */
function heroContrast(f: SiteFeatures): Mobile390Finding | null {
  const hero = f.home[0];
  if (!hero) return null;
  const flat = f.nodesBySection.get(hero.id) ?? [];
  const weak: string[] = [];
  const backdrops = flat.filter((x) => (x.node.type === "scene" || x.node.type === "parallax_layers" || x.node.type === "shader_field") || (!!(x.node.src ?? x.node.mediaRef) && x.depth <= 1));
  const hasBackdrop = backdrops.length > 0 || !!hero.bgImage;
  const root = flat[0]?.node;
  for (const x of flat) {
    const s = phoneStyle(x.node);
    if (!(x.node.type === "heading" || x.node.type === "text") || !s.color) continue;
    const bg = s.background ?? (root ? phoneStyle(root).background : undefined);
    if (bg) {
      const r = contrastRatio(s.color, bg);
      if (r !== null && r < ((s.size ?? 16) >= 24 ? 3 : 4.5)) weak.push("a hero line is hard to read on its background");
    } else if (hasBackdrop && root && root.type !== "scene" && !(root.style?.gradientTo || root.style?.background)) {
      // Text with its own colour straight over a picture, and no scene scrim or gradient to keep it readable.
      weak.push("hero text sits on a picture with no dark overlay behind it");
    }
  }
  if (root?.type === "scene" && root.scrim?.opacity === 0 && flat.some((x) => nodeStrings(x.node).length && x.node.type !== "button")) weak.push("the opening picture has its overlay switched off");
  if (!weak.length) return null;
  return {
    id: "hero_contrast", hard: false,
    detail: `on phones, ${weak[0]}.`,
    fix: "Add a dark overlay behind the headline or pick a photo with a calm area for the text, and keep text at 4.5:1 contrast (3:1 for large headlines).",
    sections: [hero.id],
  };
}

/* 6 ------------------------------------------------------------------------------------------------------------ */
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const contactKeys = (strings: readonly (string | null | undefined)[]): Set<string> => {
  const keys = new Set<string>();
  for (const raw of strings) {
    if (!raw) continue;
    for (const m of raw.matchAll(PHONE_RE)) {
      const d = m[1]!.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      if (d.length >= 10) keys.add(`p:${d}`);
    }
    for (const m of raw.matchAll(EMAIL_RE)) keys.add(`e:${m[0].toLowerCase()}`);
  }
  return keys;
};
const CONTACT_WIDGETS = new Set(["contact_details", "direct_contact"]);
function repeatedContact(f: SiteFeatures): Mobile390Finding | null {
  const scope = f.home.filter((s) => s.kind === "footer" || s.kind === "contact" || (f.nodesBySection.get(s.id) ?? []).some((x) => x.node.type === "widget" && CONTACT_WIDGETS.has((x.node.text ?? "").trim())));
  if (!scope.length) return null;
  const seen = new Map<string, Set<string>>();
  const note = (key: string, sectionId: string) => seen.set(key, (seen.get(key) ?? new Set()).add(sectionId));
  const counts = new Map<string, number>();
  const bump = (keys: Set<string>, sectionId: string) => { for (const k of keys) { counts.set(k, (counts.get(k) ?? 0) + 1); note(k, sectionId); } };
  let widgets = 0;
  const widgetSections: string[] = [];
  for (const s of scope) {
    bump(contactKeys([s.heading, s.subheading, s.body]), s.id);
    for (const c of s.components ?? []) bump(contactKeys([c.label, c.body, c.linkLabel, c.linkUrl]), s.id);
    for (const x of f.nodesBySection.get(s.id) ?? []) {
      bump(contactKeys([...nodeStrings(x.node), x.node.href, x.node.primaryCta?.href, x.node.secondaryCta?.href]), s.id);
      if (x.node.type === "widget" && CONTACT_WIDGETS.has((x.node.text ?? "").trim())) { widgets += 1; widgetSections.push(s.id); }
    }
  }
  const repeated = [...counts].filter(([, n]) => n > 1);
  if (!repeated.length && widgets <= 1) return null;
  const phone = repeated.some(([k]) => k.startsWith("p:"));
  return {
    id: "repeated_contact", hard: false,
    detail: widgets > 1 && !repeated.length
      ? "on phones, the contact details block appears more than once in the footer and contact area."
      : `on phones, the same ${phone ? "phone number" : "email address"} is repeated in the footer and contact area.`,
    fix: "Show the phone number and email once, in a single clean contact block.",
    sections: uniq([...repeated.flatMap(([k]) => [...(seen.get(k) ?? [])]), ...(widgets > 1 ? widgetSections : [])]),
  };
}

/* 7 ------------------------------------------------------------------------------------------------------------ */
function coveredText(f: SiteFeatures): Mobile390Finding | null {
  const pinned = f.nodes.filter((x) => {
    const s = phoneStyle(x.node);
    return !hiddenOnPhone(x.node) && (s.position === "sticky" || s.position === "absolute") && (s.zIndex ?? 0) >= 1 && ((s.top !== undefined && s.top <= 0) || (s.bottom !== undefined && s.bottom <= 0));
  });
  const top = pinned.filter((x) => (phoneStyle(x.node).top ?? 1) <= 0);
  const tall = pinned.filter((x) => (phoneStyle(x.node).minHeight ?? 0) > PHONE_HEIGHT * 0.3 && x.node.type !== "scene");
  const bad = [...(top.length > 1 ? top : []), ...tall];
  if (!bad.length) return null;
  return {
    id: "covered_text", hard: false,
    detail: "on phones, a pinned header or bar stacks on another one, or is tall enough to cover the text underneath.",
    fix: "Keep one slim pinned header at most, and one bottom action bar, each small enough that the text under it stays readable.",
    sections: uniq(bad.map((x) => x.sectionId)),
  };
}

/* 8 ------------------------------------------------------------------------------------------------------------ */
function noContent(f: SiteFeatures): Mobile390Finding | null {
  const holding = f.texts.filter((t) => HOLDING_TEXT.test(t.text));
  const empty = f.home.length === 0 || f.home.every((s) => !sectionHasContent(s, f));
  if (!empty && !holding.length) return null;
  return {
    id: "no_content", hard: true,
    detail: f.home.length === 0
      ? "on phones, the home page has no sections, so visitors would only see \"This website is being updated\"."
      : "on phones, the home page has no real content, so visitors would only see a holding page.",
    fix: "Build the home page: a hero with a headline and action button, the services, and an enquiry form.",
    sections: uniq(holding.map((t) => t.id)),
  };
}

/** Runs the eight phone checks. Pure. */
export function checkMobile390(site: SiteModel, f: SiteFeatures): Mobile390Result {
  const findings = [debugOverlay(f), ownerPill(f), sidewaysScroll(f), emptyGaps(site, f), heroContrast(f), repeatedContact(f), coveredText(f), noContent(f)].filter((x): x is Mobile390Finding => x !== null);
  const hardFailure = findings.some((x) => x.hard);
  const score = hardFailure ? 0 : Math.max(0, 1 - 0.25 * findings.length);
  return { checks: MOBILE_390_CHECKS, findings, score, hardFailure };
}
