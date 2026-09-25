/**
 * IMPROVEMENT GATE — Terra compares current and proposed versions side by side
 * on objective safeguards only. The proposal wins only when objective readiness
 * rises and it does not lose on a protected area. Aesthetic preference never
 * decides the gate.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import type { Thinker } from "@/lib/builder/review-panel.server";

export const GATE_AREAS = ["clarity", "conversion", "seo", "accessibility", "mobile", "truthfulness"] as const;
export type GateArea = (typeof GATE_AREAS)[number];
export const PROTECTED_AREAS: GateArea[] = ["truthfulness", "accessibility", "mobile"];

export type GateScores = Record<GateArea, number>;
export type GateReport = {
  accepted: boolean;
  reason: string;
  current: GateScores | null;
  proposed: GateScores | null;
  model: string | null;
};

function readScores(raw: unknown): GateScores | null {
  if (!raw || typeof raw !== "object") return null;
  const out = {} as GateScores;
  for (const area of GATE_AREAS) {
    const value = (raw as Record<string, unknown>)[area];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    out[area] = Math.max(0, Math.min(10, value));
  }
  return out;
}

/** Pure decision rule — exported for tests. */
export function decide(current: GateScores, proposed: GateScores): { accepted: boolean; reason: string } {
  const dropped = PROTECTED_AREAS.filter((area) => proposed[area] < current[area]);
  if (dropped.length) return { accepted: false, reason: `The revision was weaker on ${dropped.join(", ")}, so the stronger version was kept.` };
  const total = (s: GateScores) => GATE_AREAS.reduce((sum, a) => sum + s[a], 0);
  if (total(proposed) <= total(current)) return { accepted: false, reason: "The revision did not score higher overall, so the stronger version was kept." };
  return { accepted: true, reason: "The revision scored higher and held every protected area." };
}

export async function runImprovementGate(
  input: { organizationId: string; context: string; current: unknown; proposed: unknown },
  thinker: Thinker = callBestThinker,
): Promise<GateReport & { costMicrocents: number }> {
  const keep = (reason: string, model: string | null = null, costMicrocents = 0) =>
    ({ accepted: false, reason, current: null, proposed: null, model, costMicrocents });
  const call = await thinker({
    json: true,
    purpose: "quality_review",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 900,
    system: [
      "You are Terra, the senior quality reviewer. Score two versions (A = current, B = proposed) from 0 to 10 on objective readiness only. Do not score visual taste. Areas:",
      GATE_AREAS.join(", "),
      ". Be strict and consistent; score each version independently on the same rubric.",
      'Respond with JSON only: {"A": {<area>: number}, "B": {<area>: number}}.',
    ].join(" "),
    user: [input.context, "", "A (current):", JSON.stringify(input.current), "", "B (proposed):", JSON.stringify(input.proposed)].join("\n"),
  });
  if (!call.ok) return keep("The reviewer was unavailable, so the current version was kept.");
  const cost = call.costMicrocents ?? 0;
  const start = call.text.indexOf("{");
  const end = call.text.lastIndexOf("}");
  let parsed: { A?: unknown; B?: unknown } = {};
  try {
    parsed = start >= 0 && end > start ? JSON.parse(call.text.slice(start, end + 1)) : {};
  } catch {
    parsed = {};
  }
  const current = readScores(parsed.A);
  const proposed = readScores(parsed.B);
  if (!current || !proposed) return keep("The review could not be read, so the current version was kept.", call.model ?? null, cost);
  return { ...decide(current, proposed), current, proposed, model: call.model ?? null, costMicrocents: cost };
}
