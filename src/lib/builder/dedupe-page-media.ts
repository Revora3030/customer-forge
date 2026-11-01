/**
 * One picture, one place on a page (audit item 3: the hero photo came back as
 * the second section's backdrop). A pure pass over the page's section roots,
 * in page order: a picture already used by an EARLIER section is swapped for an
 * unused picture from the site's own library, or, when there is none, dropped
 * (a scene keeps its copy and loses only the backdrop). Repeats inside one
 * section, galleries, marquees, before/after pairs, spins, tours, parallax
 * and scrub layers, logos, videos and 3D models are intentional and untouched.
 */
import type { CompositionNode } from "@/lib/builder/composition-tree";

const KEEP_AS_IS = new Set(["gallery", "marquee", "compare", "before_after_slider", "spin_viewer", "tour_360", "parallax_layers", "scrub_sequence", "scroll_chapters", "lens_magnifier", "model_3d_viewer", "collection_row"]);
const NOT_A_PHOTO = /\.(?:mp4|webm|mov|m4v|glb|gltf|usdz|svg)(?:[?#]|$)|logo\.dev|\/logos?\//i;

/** Same picture whatever its resize/crop query string. */
export function mediaKey(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  return raw.split(/[?#]/)[0]!.toLowerCase();
}

export const isPhotoUrl = (url: string | null | undefined): boolean => Boolean(mediaKey(url)) && !NOT_A_PHOTO.test(String(url));

export type PageMediaOptions = {
  /** Resolve a section's mediaRef to its picture URL. */
  urlOf: (sectionIndex: number, ref: string) => string | null;
  /** Spare pictures from the site's own library, best first. */
  pool?: readonly string[];
};

type Found = { node: CompositionNode; parent: CompositionNode | null; index: number; scene: boolean; keep: boolean };

function collect(node: CompositionNode, parent: CompositionNode | null, index: number, keep: boolean, out: Found[]): void {
  const here = keep || KEEP_AS_IS.has(node.type);
  if (node.type === "media") out.push({ node, parent, index, scene: parent?.type === "scene" && index === 0, keep: here });
  (node.children ?? []).forEach((child, i) => collect(child, node, i, here, out));
}

/** Returns the roots with repeated pictures swapped or dropped. Roots needing no change are returned as they are. */
export function dedupePageMedia(roots: readonly (CompositionNode | null)[], options: PageMediaOptions): (CompositionNode | null)[] {
  const used = new Set<string>();
  const spare = (options.pool ?? []).filter(isPhotoUrl);
  const next = roots.map((root) => (root ? (structuredClone(root) as CompositionNode) : null));
  let changed = false;
  next.forEach((root, sectionIndex) => {
    if (!root) return;
    const found: Found[] = [];
    collect(root, null, 0, false, found);
    const urlFor = (node: CompositionNode) => (node.src ? node.src : node.mediaRef ? options.urlOf(sectionIndex, node.mediaRef) : null);
    const sectionKeys = new Set<string>();
    const drops = new Set<CompositionNode>();
    for (const item of found) {
      const url = urlFor(item.node);
      const key = mediaKey(url);
      if (!key || !isPhotoUrl(url)) continue;
      const earlier = used.has(key) && !sectionKeys.has(key);
      if (earlier && !item.keep) {
        const pick = spare.find((candidate) => {
          const k = mediaKey(candidate);
          return k !== null && !used.has(k) && !sectionKeys.has(k);
        });
        changed = true;
        if (pick) {
          item.node.src = pick;
          delete item.node.mediaRef;
          sectionKeys.add(mediaKey(pick)!);
        } else if (item.scene) {
          // Keep the slot (the scene reads its first child as the backdrop) but with no picture.
          delete item.node.src;
          delete item.node.mediaRef;
        } else if (item.parent) drops.add(item.node);
        continue;
      }
      sectionKeys.add(key);
    }
    if (drops.size) {
      const prune = (node: CompositionNode) => {
        if (node.children) node.children = node.children.filter((child) => !drops.has(child));
        node.children?.forEach(prune);
      };
      prune(root);
    }
    for (const key of sectionKeys) used.add(key);
  });
  return changed ? next : [...roots];
}
