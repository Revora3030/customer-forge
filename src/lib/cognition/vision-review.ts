/**
 * Pillar 4 (Senses): visual critique that can never overrule measurement.
 * A vision model's opinion of a screenshot is advisory; measured failures
 * (overflow, script errors, contrast) stay failures whatever it says, and a
 * missing measurement is reported as "not measured", never as a pass.
 */
export const REVIEW_VIEWPORTS = [320, 390, 768, 1280, 2560] as const;
export type ReviewViewport = (typeof REVIEW_VIEWPORTS)[number];

export type MeasuredFinding = { viewport: ReviewViewport; check: string; severity: "P0" | "P1" | "P2"; detail: string };
export type Measurement = { viewport: ReviewViewport; measured: boolean; findings: MeasuredFinding[] };

export type VisionIssue = { viewport: ReviewViewport; severity: "P0" | "P1" | "P2"; note: string };
export type VisionCritique = { score: number; issues: VisionIssue[] };

export function parseVisionCritique(raw: unknown): VisionCritique | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { score?: unknown; issues?: unknown };
  if (typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 10) return null;
  if (!Array.isArray(row.issues) || row.issues.length > 20) return null;
  const issues: VisionIssue[] = [];
  for (const item of row.issues) {
    const issue = item as { viewport?: unknown; severity?: unknown; note?: unknown };
    if (!(REVIEW_VIEWPORTS as readonly unknown[]).includes(issue?.viewport)) return null;
    if (issue.severity !== "P0" && issue.severity !== "P1" && issue.severity !== "P2") return null;
    if (typeof issue.note !== "string" || !issue.note.trim()) return null;
    issues.push({ viewport: issue.viewport as ReviewViewport, severity: issue.severity, note: issue.note.trim().slice(0, 300) });
  }
  return { score: Math.round(row.score * 10) / 10, issues };
}

export type ReviewVerdict = {
  status: "failed" | "passed" | "incomplete";
  notMeasured: ReviewViewport[];
  blocking: MeasuredFinding[];
  advisory: VisionIssue[];
  /** Always null unless every viewport was measured and nothing blocks. */
  score: number | null;
};

export function mergeReview(measurements: readonly Measurement[], critique: VisionCritique | null): ReviewVerdict {
  const byViewport = new Map(measurements.map((m) => [m.viewport, m]));
  const notMeasured = REVIEW_VIEWPORTS.filter((viewport) => !byViewport.get(viewport)?.measured);
  const blocking = measurements.filter((m) => m.measured).flatMap((m) => m.findings).filter((f) => f.severity === "P0");
  const status = blocking.length ? "failed" : notMeasured.length ? "incomplete" : "passed";
  return {
    status,
    notMeasured,
    blocking,
    advisory: critique?.issues ?? [],
    score: status === "passed" ? (critique?.score ?? null) : null,
  };
}
