import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

/** Every media ref a composition currently points at, in document order. */
export function compositionMediaRefs(tree: CompositionTree): string[] {
  const refs: string[] = [];
  const visit = (node: CompositionNode) => {
    if (node.type === "media" && node.mediaRef) refs.push(node.mediaRef);
    node.children?.forEach(visit);
  };
  visit(tree.root);
  return refs;
}

/**
 * Makes sure a freshly generated picture is actually reachable from its
 * section's layout. A generated image that no media node points at never
 * renders, which is how "I added pictures" could be true in the database and
 * false on the page. Returns null when the tree already shows the picture.
 *
 * Order of preference: reuse the first media slot whose picture is dead
 * (missing file / no media), otherwise add a media node to the root.
 */
export function linkGeneratedMedia(
  tree: CompositionTree,
  componentId: string,
  deadRefs: ReadonlySet<string>,
  alt?: string,
): CompositionTree | null {
  if (compositionMediaRefs(tree).includes(componentId)) return null;
  let replaced = false;
  const visit = (node: CompositionNode): CompositionNode => {
    if (!replaced && node.type === "media" && !node.src && (!node.mediaRef || deadRefs.has(node.mediaRef))) {
      replaced = true;
      return { ...node, mediaRef: componentId, ...(alt && !node.alt ? { alt } : {}) };
    }
    return node.children ? { ...node, children: node.children.map(visit) } : node;
  };
  const root = visit(tree.root);
  if (replaced) return { ...tree, root };
  const media: CompositionNode = {
    type: "media",
    mediaRef: componentId,
    ...(alt ? { alt } : {}),
    style: { radius: 16 } as CompositionNode["style"],
  };
  return { ...tree, root: { ...root, children: [...(root.children ?? []), media] } };
}
