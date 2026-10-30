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

export const STUDIO_CANVAS = "#0a0d10";
export const STUDIO_INK = "#f4f1ea";

const CHAPTER = new Set(["scene", "scroll_chapters", "scrub_sequence"]);

export function compositionHasChapter(node: CompositionNode | null | undefined): boolean {
  if (!node) return false;
  if (CHAPTER.has(node.type)) return true;
  return (node.children ?? []).some(compositionHasChapter);
}

/** CSS variables that put forms, menus and the page on one dark glass canvas. */
export function studioThemeVars(): Record<string, string> {
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

/** A light or mid section fill on a studio page becomes the obsidian canvas. */
export function studioSectionColor(bg: string | null, studio: boolean): string | null {
  if (!studio || !bg || !/^#[0-9a-f]{6}$/i.test(bg)) return bg;
  return luminance(bg) > 0.12 ? STUDIO_CANVAS : bg;
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

/** Drops light fills and dark ink so a chapter sits on the studio canvas. */
export function healStudioNode(node: CompositionNode): CompositionNode {
  const healed = healSplitCards(node);
  const style = healed.style;
  const nextStyle = style ? stripLightStyle(style) : style;
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

export function prepareStudioPage(roots: readonly (CompositionNode | null)[], studio = roots.some((root) => compositionHasChapter(root))): { studio: boolean; roots: (CompositionNode | null)[] } {
  if (!studio) return { studio, roots: [...roots] };
  const present = roots.map((root) => root ?? ({ type: "stack" } as CompositionNode));
  const pruned = omitRepeatedCalls(present);
  return {
    studio,
    roots: pruned.map((root, index) => (roots[index] ? asChapter(healStudioNode(root)) : null)),
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
