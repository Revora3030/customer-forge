import { readComposition, type CompositionNode } from "./composition-tree";

/** Only dedicated FAQ content that the composition actually renders. Hidden
 * nodes and inactive tab panels are excluded rather than advertised to crawlers. */
export function compositionFaqItems(sections: readonly { settings?: unknown }[]) {
  const items: { q: string; a: string }[] = [];
  const seen = new Set<string>();
  const walk = (node: CompositionNode) => {
    if (node.style?.hidden || Object.values(node.responsive ?? {}).some((style) => style?.hidden)) return;
    if (node.type === "faq_accordion") {
      for (const item of node.faqItems ?? []) {
        const key = JSON.stringify([item.question, item.answer]);
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ q: item.question, a: item.answer });
        }
      }
    }
    if (node.type === "tabs" || node.type === "toggle" || node.type === "tab_group") return;
    for (const child of node.children ?? []) walk(child);
  };
  for (const section of sections) {
    const tree = readComposition(section.settings);
    if (tree) walk(tree.root);
  }
  return items;
}