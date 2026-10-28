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
const PICTURE_ONLY = new Set(["gallery", "spin_viewer", "before_after_slider", "compare"]);
/** Containers that cannot show anything with one of their pictures gone. */
const NEEDS_EVERY_PICTURE = new Set(["before_after_slider", "compare"]);

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

/**
 * One unsaved picture must not block a whole site: drop media nodes whose
 * reference was never saved, turn a scene that lost its backdrop into a plain
 * stack (same copy, no picture), remove picture-only containers left empty, and
 * drop a before/after pair that lost either side. A picture reference on any
 * other node or nested object (a card image, a list item) is removed from it,
 * so no reference to a missing picture survives however it was written.
 * Returns null when nothing referenced a missing picture.
 */
export function dropMissingPictures(settings: unknown, missing: ReadonlySet<string>): Record<string, unknown> | null {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : null;
  const root = base?.["composition"] as { root?: Node } | undefined;
  if (!root?.root) return null;
  let changed = false;
  const fix = (node: Node): Node | null => {
    if (node.type === "media" && typeof node.mediaRef === "string" && missing.has(node.mediaRef)) {
      changed = true;
      return null;
    }
    if (NEEDS_EVERY_PICTURE.has(String(node.type)) && refsWithin(node).some(ref => missing.has(ref))) {
      changed = true;
      return null;
    }
    // A picture reference outside the children (a before/after side, a list item,
    // a card image) is taken off its owner; the owner keeps its words.
    const { children: kids, ...rest } = node;
    if (refsWithin(rest).some(ref => missing.has(ref))) changed = true;
    const cleaned = withoutMissingRefs(rest, missing) as Node;
    if (!Array.isArray(kids)) return kids === undefined ? cleaned : { ...cleaned, children: kids };
    const before = kids.length;
    const children = kids.map(fix).filter((child): child is Node => child !== null);
    const next: Node = { ...cleaned, children };
    if (children.length !== before) {
      if (node.type === "scene" && children[0]?.type !== "media") next.type = "stack";
      if (PICTURE_ONLY.has(String(node.type)) && !children.some(c => c.type === "media")) return null;
    }
    return next;
  };
  const fixedRoot = fix(root.root);
  if (!changed) return null;
  return { ...base, composition: { ...root, root: fixedRoot ?? { type: "stack", children: [] } } };
}
