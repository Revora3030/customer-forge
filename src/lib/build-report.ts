/**
 * Per-build report for the admin monitoring view: which primitives a site's
 * compositions use, how many pictures it holds, and how long each stage took.
 * Counts and timings only, never tenant words. Pure so it is unit tested.
 */
import { INTERACTIVE_PRIMITIVES, readComposition, type CompositionNode } from "@/lib/builder/composition-tree";

export type SectionSettingsRow = { settings: unknown };
export type PictureRow = { status: string };

export type BuildReport = {
  sections: number;
  composed: number;
  primitives: { type: string; count: number }[];
  interactive: number;
  pictures: { total: number; approved: number; pending: number; rejected: number; failed: number };
  stages: { stage: string; seconds: number }[];
};

function countNodes(node: CompositionNode, into: Map<string, number>) {
  into.set(node.type, (into.get(node.type) ?? 0) + 1);
  for (const child of node.children ?? []) countNodes(child, into);
}

export function buildReport(
  sections: readonly SectionSettingsRow[],
  pictures: readonly PictureRow[],
  stageTimings: Record<string, number> | null | undefined,
): BuildReport {
  const counts = new Map<string, number>();
  let composed = 0;
  for (const section of sections) {
    const tree = readComposition(section.settings);
    if (!tree) continue;
    composed += 1;
    countNodes(tree.root, counts);
  }
  const picture = (status: string) => pictures.filter((p) => p.status === status).length;
  return {
    sections: sections.length,
    composed,
    primitives: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    interactive: [...counts].filter(([type]) => INTERACTIVE_PRIMITIVES.has(type)).reduce((sum, [, n]) => sum + n, 0),
    pictures: { total: pictures.length, approved: picture("approved"), pending: picture("pending"), rejected: picture("rejected"), failed: picture("failed") },
    stages: Object.entries(stageTimings ?? {})
      .filter(([, ms]) => typeof ms === "number" && Number.isFinite(ms) && ms >= 0)
      .map(([stage, ms]) => ({ stage, seconds: Math.round(ms / 100) / 10 }))
      .sort((a, b) => b.seconds - a.seconds),
  };
}
