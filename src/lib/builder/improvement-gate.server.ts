/**
 * IMPROVEMENT GATE — non-creative safeguard only.
 *
 * Sol can revise a composition after team notes. This gate never scores taste,
 * richness, originality or subjective quality. It only rejects a proposal that is
 * structurally unsafe for the renderer; otherwise the AI-authored revision is
 * allowed through.
 */
import { validateComposition } from "@/lib/builder/composition-tree";

export const GATE_AREAS = ["renderer", "accessibility", "mobile", "truthfulness"] as const;
export type GateArea = (typeof GATE_AREAS)[number];
export const PROTECTED_AREAS: GateArea[] = ["renderer", "accessibility", "mobile", "truthfulness"];

export type GateBlocker = { area: GateArea; path: string; issue: string };
export type GateReport = {
  accepted: boolean;
  reason: string;
  blocked: GateBlocker[];
  model: string | null;
};

function trees(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Pure decision rule — exported for tests. */
export function decide(blocked: GateBlocker[]): { accepted: boolean; reason: string } {
  if (blocked.length) {
    const first = blocked[0]!;
    return {
      accepted: false,
      reason: `The revision was rejected by the ${first.area} safeguard at ${first.path}: ${first.issue}.`,
    };
  }
  return { accepted: true, reason: "The revision passed the non-creative safety safeguards." };
}

export async function runImprovementGate(input: {
  organizationId: string;
  context: string;
  current: unknown;
  proposed: unknown;
}): Promise<GateReport & { costMicrocents: number }> {
  void input.organizationId;
  void input.context;
  void input.current;
  const blocked: GateBlocker[] = [];
  const proposed = trees(input.proposed);
  if (!Object.keys(proposed).length) {
    blocked.push({ area: "renderer", path: "proposal", issue: "no proposed composition trees were supplied" });
  }
  for (const [id, tree] of Object.entries(proposed)) {
    const checked = validateComposition(tree);
    if (!checked.ok) {
      for (const issue of checked.issues.slice(0, 8)) {
        blocked.push({ area: "renderer", path: `${id}.${issue.path}`, issue: issue.problem });
      }
    }
  }
  return { ...decide(blocked), blocked, model: null, costMicrocents: 0 };
}
