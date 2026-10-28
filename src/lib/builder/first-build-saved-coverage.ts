import { MIN_CHAPTERS } from "./cinematic-primitives";
import { readComposition } from "./composition-tree";

export type SavedBuildPage = { id: string; slug: string };
export type SavedBuildSection = { id: string; page_id: string; kind: string; settings: unknown };
export type FirstBuildInventory = {
  pages: SavedBuildPage[];
  sections: { id: string; page_id: string; role: string }[];
};
export type ExpectedBuildCoverage = { pages: number; sections: number; inventory?: FirstBuildInventory };

function sameInventory(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const counts = new Map<string, number>();
  for (const key of expected) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const key of actual) {
    const remaining = counts.get(key) ?? 0;
    if (!remaining) return false;
    counts.set(key, remaining - 1);
  }
  return true;
}

function savedSectionRole(section: SavedBuildSection): string {
  if (section.kind !== "composition") return section.kind;
  const settings = section.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "";
  const role = (settings as Record<string, unknown>)["role"];
  return typeof role === "string" ? role : "";
}

/** Saved renderer coverage, not a creative template or a visual-quality score. */
export function firstBuildCoverageProblems(
  pages: readonly SavedBuildPage[],
  sections: readonly SavedBuildSection[],
  expected: ExpectedBuildCoverage,
): string[] {
  const problems: string[] = [];
  if (!pages.length || pages.length < expected.pages) problems.push("Saved page inventory is incomplete");
  if (sections.length < expected.sections) problems.push("Saved section inventory is incomplete");
  if (new Set(pages.map(page => page.id)).size !== pages.length) problems.push("Saved page inventory contains duplicate identities");
  if (new Set(sections.map(section => section.id)).size !== sections.length) problems.push("Saved section inventory contains duplicate identities");
  if (expected.inventory) {
    const pageKey = (page: SavedBuildPage) => JSON.stringify([page.id, page.slug]);
    if (!sameInventory(pages.map(pageKey), expected.inventory.pages.map(pageKey))) {
      problems.push("Saved pages do not match the accepted build inventory");
    }
    const sectionKey = (section: { id: string; page_id: string; role: string }) => JSON.stringify([section.id, section.page_id, section.role]);
    if (!sameInventory(sections.map(section => sectionKey({ ...section, role: savedSectionRole(section) })), expected.inventory.sections.map(sectionKey))) {
      problems.push("Saved sections do not match the accepted build inventory");
    }
  }
  const pageIds = new Set(pages.map(page => page.id));
  for (const page of pages) {
    if (!sections.some(section => section.page_id === page.id)) problems.push(`Page ${page.slug} has no sections`);
  }
  for (const section of sections) {
    if (!pageIds.has(section.page_id)) problems.push(`Section ${section.id} has no page`);
    // These two mechanics render outside composition; all other sections,
    // including contact/booking/quote widgets, need an authored design.
    if (section.kind === "embed" || section.kind === "post_list") continue;
    if (section.kind !== "composition" || !readComposition(section.settings)) {
      problems.push(`Section ${section.id} has no renderable AI design`);
    }
  }
  return problems;
}

/** Every website-picture reference saved in compositions (temp_ refs are never valid after apply). */
export function savedPictureRefs(sections: readonly SavedBuildSection[]): Map<string, string> {
  const refs = new Map<string, string>();
  const visit = (value: unknown, sectionId: string) => {
    if (Array.isArray(value)) return value.forEach(item => visit(item, sectionId));
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "mediaRef" && typeof child === "string" && child) refs.set(child, sectionId);
      else visit(child, sectionId);
    }
  };
  for (const section of sections) visit(section.settings, section.id);
  return refs;
}

/** Pictures the design asks for but the website's media library does not hold render as blanks. */
export function missingPictureProblems(sections: readonly SavedBuildSection[], savedMediaIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const [ref, sectionId] of savedPictureRefs(sections)) {
    if (!savedMediaIds.has(ref)) problems.push(`Section ${sectionId} shows a picture that was never saved`);
  }
  return problems;
}
type Node = { type?: string; mediaRef?: string; src?: string; children?: Node[]; [key: string]: unknown };
/** Containers that cannot show anything with one of their pictures gone. */
const NEEDS_EVERY_PICTURE = new Set(["before_after_slider", "compare"]);
/** Settings the renderer accepts only on a scene; a scene that becomes a stack has to give them up. */
const SCENE_ONLY_SETTINGS = ["anchor", "scrub", "scrim", "focal"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Every picture reference inside a value, wherever it sits (a node, a before/after side, a list item). */
function refsWithin(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach(item => refsWithin(item, out));
  else if (isRecord(value))
    for (const [key, child] of Object.entries(value)) {
      if (key === "mediaRef" && typeof child === "string") out.push(child);
      else refsWithin(child, out);
    }
  return out;
}

/** The same value without any `mediaRef` that points at a missing picture. */
function withoutMissingRefs(value: unknown, missing: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map(item => withoutMissingRefs(item, missing));
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "mediaRef" && typeof child === "string" && missing.has(child)) continue;
    out[key] = withoutMissingRefs(child, missing);
  }
  return out;
}

/** A block that lost its backdrop or pinned picture keeps all of its copy as a plain stack. */
function asStack(node: Node): Node {
  const stack: Node = { ...node, type: "stack" };
  for (const key of SCENE_ONLY_SETTINGS) delete stack[key];
  return stack;
}

/**
 * What a block becomes once some of its children are gone, so it is still a
 * block the renderer accepts (the build refuses a repair the renderer would not
 * show). `survived` says which of its original children are still there, in
 * order; `next` is the block rebuilt from them. Null removes the block.
 */
function reshape(original: Node, next: Node, survived: readonly boolean[]): Node | null {
  const kids = next.children ?? [];
  switch (original.type) {
    case "scene":
    case "sticky_split_story":
      // Both start with their picture; without it they are plain copy.
      return survived[0] ? next : asStack(next);
    case "scroll_chapters":
      // Every chapter is a scene. One that became a stack takes the chapters with it.
      return kids.length >= MIN_CHAPTERS && kids.every(kid => kid.type === "scene") ? next : asStack(next);
    case "parallax_layers":
      // The back layer carries the scene, and two layers are the least that drift.
      return survived[0] && kids.length >= 2 ? next : null;
    case "lens_magnifier":
      return kids.length === 1 ? next : null;
    case "toggle":
      return kids.length === 2 ? next : null;
    case "gallery":
    case "spin_viewer":
    case "marquee":
    case "tabs":
    case "accordion":
      return kids.length ? next : null;
    default:
      return next;
  }
}

type Repaired = { node: Node | null; touched: boolean };

function repairNode(node: Node, missing: ReadonlySet<string>): Repaired {
  if (node.type === "media" && typeof node.mediaRef === "string" && missing.has(node.mediaRef)) return { node: null, touched: true };
  if (NEEDS_EVERY_PICTURE.has(String(node.type)) && refsWithin(node).some(ref => missing.has(ref))) return { node: null, touched: true };
  // A picture reference outside the children (a before/after side, a list item,
  // a card image) is taken off its owner; the owner keeps its words.
  const { children: kids, ...rest } = node;
  const ownTouched = refsWithin(rest).some(ref => missing.has(ref));
  const cleaned = withoutMissingRefs(rest, missing) as Node;
  if (!Array.isArray(kids)) return { node: kids === undefined ? cleaned : { ...cleaned, children: kids }, touched: ownTouched };
  const results = kids.map(kid => repairNode(kid, missing));
  const next: Node = { ...cleaned, children: results.flatMap(result => (result.node ? [result.node] : [])) };
  const childTouched = results.some(result => result.touched);
  const touched = ownTouched || childTouched;
  // Only a block that lost something inside is reshaped; the rest stay as authored.
  return { node: childTouched ? reshape(node, next, results.map(result => result.node !== null)) : next, touched };
}

/**
 * One unsaved picture must not block a whole site. Media nodes whose reference
 * was never saved are dropped, and so is a before/after pair that lost either
 * side. A picture reference on any other node or nested object (a card image, a
 * list item) is removed from it, so no reference to a missing picture survives
 * however it was written. A block that depended on the lost picture is reshaped
 * so the section still renders: a scene or sticky story without its picture is a
 * plain stack with the same copy, scroll chapters with a pictureless chapter
 * become a stack of chapters, and a loupe, parallax, gallery, spin viewer, row of
 * logos, tab group or toggle left without what it needs is removed.
 * Returns null when nothing referenced a missing picture.
 */
export function dropMissingPictures(settings: unknown, missing: ReadonlySet<string>): Record<string, unknown> | null {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : null;
  const root = base?.["composition"] as { root?: Node } | undefined;
  if (!root?.root) return null;
  const repaired = repairNode(root.root, missing);
  if (!repaired.touched) return null;
  return { ...base, composition: { ...root, root: repaired.node ?? { type: "stack", children: [] } } };
}
