import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PipelineLanesView } from "./PipelineLanes";
import type { PipelineLanes } from "@/lib/builder/pipeline-lanes";

const lane = { jobId: "j1", organizationId: "o1-aaaaaaaa", name: "Acme Plumbing", status: "failed", stalled: false, stage: { key: "pictures", label: "Pictures", number: 8, total: 14 }, elapsedMs: 600_000, elapsedFrom: "started" as const, waitReason: null, resumesAt: null, attempts: 2, failureKind: "timeout", handoffs: [{ tier: "sol" as const, stage: "brand", at: "" }, { tier: "terra" as const, stage: "qa", at: "" }], otherCalls: 1, retry: { step: "pictures", label: "Pictures", checkpoints: ["identity"] } };
const board = (over: Partial<PipelineLanes> = {}): PipelineLanes => ({ checkedAt: "", jobsAvailable: true, traceAvailable: true, lanes: [lane], success: { rate: 0.75, succeeded: 3, failed: 1, n: 4, windowDays: 7 }, ...over });

describe("PipelineLanesView", () => {
  it("shows measured success with N, the stage, handoffs and a draft-only retry", () => {
    const html = renderToStaticMarkup(<PipelineLanesView board={board()} onDraft={() => undefined} />);
    expect(html).toContain("75% (N=4)");
    expect(html).toContain("Step 8/14: Pictures");
    expect(html).toContain("Sol → Terra");
    expect(html).toContain("1 other model call");
    expect(html).toContain("Recorded cause: timeout");
    expect(html).toContain("(draft)");
  });

  it("never shows a made-up success rate", () => {
    const html = renderToStaticMarkup(<PipelineLanesView board={board({ success: null, lanes: [] })} onDraft={() => undefined} />);
    expect(html).toContain("not measured yet");
    expect(html).toContain("No active builds right now");
    expect(html).not.toMatch(/\d+% \(N=/);
  });

  it("handles unreadable jobs, error and loading", () => {
    expect(renderToStaticMarkup(<PipelineLanesView board={board({ jobsAvailable: false, lanes: [] })} onDraft={() => undefined} />)).toContain("Build jobs could not be read");
    expect(renderToStaticMarkup(<PipelineLanesView board={undefined} error onDraft={() => undefined} />)).toContain("Build lanes unavailable");
    expect(renderToStaticMarkup(<PipelineLanesView board={undefined} loading onDraft={() => undefined} />)).toContain("Loading build lanes");
  });
});
