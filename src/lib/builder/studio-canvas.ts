/**
 * How a saved cinematic tree is painted. Scenes and scroll chapters already
 * exist in the composition; a light page theme was still punching cream and
 * white bands between them. When a page has a photographic chapter, the
 * canvas stays obsidian and a repeated call-to-action bar is kept once.
 * Service names and prices are never invented here.
 */
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { mergeSplitServices } from "@/lib/builder/intake-sanitize";
import { luminance } from "@/lib/site-theme";
import type { StudioTransition } from "@/lib/builder/trade-blueprints";

export type { StudioTransition };

export const STUDIO_CANVAS = "#0a0d10";
export const STUDIO_INK = "#f4f1ea";

const CHAPTER = new Set(["scene", "scroll_chapters", "scrub_sequence"]);

export function compositionHasChapter(node: CompositionNode | null | undefined): boolean {
  if (!node) return false;
  if (CHAPTER.has(node.type)) return true;
  return (node.children ?? []).some(compositionHasChapter);
}

/** A trade blueprint's own dark canvas, so a dentist's navy and a gym's iron are not both painted obsidian. */
export type StudioCanvas = { canvas: string; surface: string; ink: string; muted: string };

/** CSS variables that put forms, menus and the page on one dark glass canvas (the blueprint's when given). */
export function studioThemeVars(canvas: StudioCanvas | null = null): Record<string, string> {
  if (canvas) {
    return {
      "--background": canvas.canvas,
      "--foreground": canvas.ink,
      "--card": "rgba(255,255,255,0.04)",
      "--card-foreground": canvas.ink,
      "--popover": canvas.surface,
      "--popover-foreground": canvas.ink,
      "--secondary": canvas.surface,
      "--secondary-foreground": canvas.ink,
      "--muted": canvas.surface,
      "--muted-foreground": canvas.muted,
      "--border": "rgba(255,255,255,0.10)",
      "--input": "rgba(0,0,0,0.45)",
      "--elevated": canvas.surface,
    };
  }
  return {
    "--background": STUDIO_CANVAS,
    "--foreground": STUDIO_INK,
    "--card": "rgba(255,255,255,0.04)",
    "--card-foreground": STUDIO_INK,
    "--popover": "#12161a",
    "--popover-foreground": STUDIO_INK,
    "--secondary": "#12161a",
    "--secondary-foreground": STUDIO_INK,
    "--muted": "#12161a",
    "--muted-foreground": "#c4beb4",
    "--border": "rgba(255,255,255,0.10)",
    "--input": "rgba(0,0,0,0.45)",
    "--elevated": "#14181c",
  };
}

/** A light or mid section fill on a studio page becomes the studio canvas (the blueprint's, else obsidian). */
export function studioSectionColor(bg: string | null, studio: boolean, canvas: string = STUDIO_CANVAS): string | null {
  if (!studio || !bg || !/^#[0-9a-f]{6}$/i.test(bg)) return bg;
  return luminance(bg) > 0.12 ? canvas : bg;
}

function buttonLabel(node: CompositionNode): string | null {
  if (node.type !== "button" && node.type !== "link") return null;
  const text = node.text?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return text.length >= 8 ? text : null;
}

/**
 * A label that appears three or more times on one page is a repeated banner.
 * The first one stays; the copies are removed. Offer-card buttons are left
 * alone so each package keeps its own action.
 */
export function omitRepeatedCalls(roots: readonly CompositionNode[]): CompositionNode[] {
  const counts = new Map<string, number>();
  const count = (node: CompositionNode, inOffer: boolean) => {
    const label = !inOffer ? buttonLabel(node) : null;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    for (const child of node.children ?? []) count(child, inOffer || node.type === "offer_card");
  };
  for (const root of roots) count(root, false);
  const repeated = new Set([...counts].filter(([, n]) => n >= 3).map(([label]) => label));
  if (!repeated.size) return [...roots];
  const seen = new Set<string>();
  const prune = (node: CompositionNode, inOffer: boolean): CompositionNode | null => {
    const label = !inOffer ? buttonLabel(node) : null;
    if (label && repeated.has(label)) {
      if (seen.has(label)) return null;
      seen.add(label);
    }
    if (!node.children?.length) return node;
    const nextOffer = inOffer || node.type === "offer_card";
    const children = node.children.map((child) => prune(child, nextOffer)).filter((child): child is CompositionNode => child !== null);
    if (children.length === node.children.length && children.every((child, i) => child === node.children![i])) return node;
    return { ...node, children };
  };
  return roots.map((root) => prune(root, false) ?? root);
}

function loneTitle(node: CompositionNode): string | null {
  const own = node.text?.trim() ?? "";
  const kids = node.children ?? [];
  if ((node.type === "heading" || node.type === "text") && kids.length === 0) return own || null;
  if (node.type !== "card" && node.type !== "stack") return null;
  const titles = kids.map(loneTitle).filter((title): title is string => Boolean(title));
  if (titles.length !== 1) return null;
  const extra = kids.some((child) => child.type !== "heading" && child.type !== "text" && child.type !== "icon");
  return extra ? null : titles[0]!;
}

function rewriteTitle(node: CompositionNode, title: string): CompositionNode {
  if ((node.type === "heading" || node.type === "text") && !(node.children ?? []).length) return { ...node, text: title };
  return { ...node, children: (node.children ?? []).map((child) => rewriteTitle(child, title)) };
}

/** Joins sibling cards whose only words are a split phrase ("Full" + "Auto detailing"). */
export function healSplitCards(node: CompositionNode): CompositionNode {
  const children = (node.children ?? []).map(healSplitCards);
  const base = children.length ? { ...node, children } : node;
  if (children.length < 2) return base;
  const out: CompositionNode[] = [];
  for (let i = 0; i < children.length; i += 1) {
    const left = loneTitle(children[i]!);
    const right = i + 1 < children.length ? loneTitle(children[i + 1]!) : null;
    if (left && right) {
      const merged = mergeSplitServices([{ name: left }, { name: right }]);
      const name = merged[0]?.name;
      if (merged.length === 1 && name && name !== left) {
        out.push(rewriteTitle(children[i]!, name));
        i += 1;
        continue;
      }
    }
    out.push(children[i]!);
  }
  return { ...base, children: out };
}

function stripLightStyle(style: NonNullable<CompositionNode["style"]>): NonNullable<CompositionNode["style"]> {
  const next = { ...style };
  if (lightHex(style.background)) {
    delete next.background;
    delete next.gradientTo;
  }
  if (darkHex(style.color)) next.color = STUDIO_INK;
  return next;
}

function lightHex(value: string | undefined): boolean {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return false;
  return luminance(value) > 0.12;
}

function darkHex(value: string | undefined): boolean {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return false;
  return luminance(value) < 0.25;
}

/**
 * Drops light fills and dark ink so a chapter sits on the studio canvas.
 * Buttons keep their own fill and ink: stripping a light button fill left a
 * bare text link where the call to action should be.
 */
export function healStudioNode(node: CompositionNode): CompositionNode {
  const healed = healSplitCards(node);
  const style = healed.style;
  const nextStyle = style && healed.type !== "button" ? stripLightStyle(style) : style;
  const children = healed.children?.map(healStudioNode);
  if (nextStyle === style && children === healed.children) return healed;
  return { ...healed, ...(nextStyle ? { style: nextStyle } : {}), ...(children ? { children } : {}) };
}

/** A scene whose picture is not the first child still paints that picture as the backdrop. */
function hoistSceneMedia(node: CompositionNode): CompositionNode {
  if (node.type !== "scene") return node;
  const kids = node.children ?? [];
  const index = kids.findIndex((child) => child.type === "media");
  if (index <= 0) return node;
  const media = kids[index]!;
  return { ...node, children: [media, ...kids.filter((_, i) => i !== index)] };
}

/**
 * A saved stack that is really a headline plus one picture becomes a full-bleed
 * scene, so the photograph sits behind the type instead of in a cream column.
 */
function asChapter(node: CompositionNode): CompositionNode {
  if (node.type === "scroll_chapters" || node.type === "scrub_sequence") {
    return { ...node, children: (node.children ?? []).map((child) => child.type === "scene" ? hoistSceneMedia(child) : child) };
  }
  if (node.type === "scene") return hoistSceneMedia(node);
  const children = node.children ?? [];
  const mediaAt = children.findIndex((child) => child.type === "media");
  const hasCopy = children.some((child) => child.type === "heading" || child.type === "text");
  if (mediaAt < 0 || !hasCopy) return node;
  const media = children[mediaAt]!;
  const rest = children.filter((_, index) => index !== mediaAt);
  return { type: "scene", anchor: "bottom-left", ...(node.style ? { style: node.style } : {}), children: [media, ...rest] };
}

/** Dark brand surface, or any photographic chapter, keeps the whole page on the studio canvas. */
export function pageUsesStudio(surface: string | null, roots: readonly (CompositionNode | null)[]): boolean {
  if (roots.some((root) => compositionHasChapter(root))) return true;
  return Boolean(surface && /^#[0-9a-f]{6}$/i.test(surface) && luminance(surface) <= 0.35);
}

/** The light half of a dark-to-light page: the blueprint's ink becomes the canvas and its canvas the ink. */
export type StudioLight = { canvas: string; ink: string; muted: string; dark: string };

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The light canvas for a dark-to-light hand-off, or null when the inverted
 * palette would not pass WCAG AA (4.5:1) for body and secondary ink, in which
 * case the page stays dark-only.
 */
export function studioLightPalette(dark: StudioCanvas | null): StudioLight | null {
  const source = dark ?? { canvas: STUDIO_CANVAS, surface: "#12161a", ink: STUDIO_INK, muted: "#c4beb4" };
  const hex = /^#[0-9a-f]{6}$/i;
  if (![source.canvas, source.surface, source.ink].every((value) => hex.test(value))) return null;
  const light: StudioLight = { canvas: source.ink, ink: source.canvas, muted: source.surface, dark: source.canvas };
  if (luminance(light.canvas) < 0.6) return null;
  if (contrast(light.canvas, light.ink) < 4.5 || contrast(light.canvas, light.muted) < 4.5) return null;
  return light;
}

/** CSS variables that put forms, menus and cards on the light half of a dark-to-light page. */
export function studioLightVars(light: StudioLight): Record<string, string> {
  return {
    "--background": light.canvas,
    "--foreground": light.ink,
    "--card": "rgba(0,0,0,0.03)",
    "--card-foreground": light.ink,
    "--popover": "#ffffff",
    "--popover-foreground": light.ink,
    "--secondary": "rgba(0,0,0,0.05)",
    "--secondary-foreground": light.ink,
    "--muted": "rgba(0,0,0,0.05)",
    "--muted-foreground": light.muted,
    "--border": "rgba(0,0,0,0.12)",
    "--input": "rgba(255,255,255,0.9)",
    "--elevated": "#ffffff",
  };
}

/** On the light half, a dark section fill is pulled onto the light canvas (the mirror of studioSectionColor). */
export function lightSectionColor(bg: string | null, light: StudioLight): string | null {
  if (!bg || !/^#[0-9a-f]{6}$/i.test(bg)) return bg;
  return luminance(bg) < 0.4 ? light.canvas : bg;
}

/**
 * Mirror of healStudioNode for the light half: drops dark fills and light ink
 * so a section reads on the light canvas. Photographic chapters keep their own
 * backdrop, scrim and ink, so they are left untouched.
 */
export function healLightNode(node: CompositionNode, light: StudioLight): CompositionNode {
  if (CHAPTER.has(node.type)) return node;
  const healed = healSplitCards(node);
  const style = healed.style;
  let nextStyle = style;
  // A button's fill and ink are a matched pair; see healStudioNode.
  if (style && healed.type !== "button") {
    const next = { ...style };
    const bg = style.background;
    if (bg && /^#[0-9a-f]{6}$/i.test(bg) && luminance(bg) < 0.4) {
      delete next.background;
      delete next.gradientTo;
    }
    const ink = style.color;
    if (ink && /^#[0-9a-f]{6}$/i.test(ink) && contrast(ink, next.background && /^#[0-9a-f]{6}$/i.test(next.background) ? next.background : light.canvas) < 4.5) next.color = light.ink;
    nextStyle = next.background === style.background && next.color === style.color && next.gradientTo === style.gradientTo ? style : next;
  }
  const children = healed.children?.map((child) => healLightNode(child, light));
  if (nextStyle === style && children === healed.children) return healed;
  return { ...healed, ...(nextStyle ? { style: nextStyle } : {}), ...(children ? { children } : {}) };
}

/**
 * Prepares a studio page. With "dark-to-light" (an explicit blueprint
 * setting), a page whose opening section is a photographic chapter keeps that
 * chapter dark and paints every following section on one light canvas:
 * exactly one intentional hand-off. `lightFrom` is the first light section's
 * index, or null when the page stays dark-only.
 */
export function prepareStudioPage(
  roots: readonly (CompositionNode | null)[],
  studio = roots.some((root) => compositionHasChapter(root)),
  transition: StudioTransition = "dark-only",
  light: StudioLight | null = null,
): { studio: boolean; roots: (CompositionNode | null)[]; lightFrom: number | null } {
  if (!studio) return { studio, roots: [...roots], lightFrom: null };
  const present = roots.map((root) => root ?? ({ type: "stack" } as CompositionNode));
  const pruned = omitRepeatedCalls(present);
  const dark = pruned.map((root, index) => (roots[index] ? asChapter(healStudioNode(root)) : null));
  const handOff = transition === "dark-to-light" && light && roots.length > 1 && compositionHasChapter(dark[0]);
  if (!handOff) return { studio, roots: dark, lightFrom: null };
  return {
    studio,
    roots: pruned.map((root, index) => (index === 0 ? dark[0]! : roots[index] ? healLightNode(root, light) : null)),
    lightFrom: 1,
  };
}

/** Pending picture rows from earlier runs that this build did not approve. */
export function stalePendingSlots(
  existing: readonly { slot: string; status: string }[],
  kept: readonly string[],
): string[] {
  const keep = new Set(kept);
  return existing.filter((row) => row.status === "pending" && row.slot && !keep.has(row.slot)).map((row) => row.slot);
}
