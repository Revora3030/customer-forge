import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/lib/jarvis-events";
import { nodesFromProgress, nodesFromRunEvents, summarizeTree, treeAnnouncement, treeHeadline, type TaskNode } from "@/lib/builder/task-tree";
import { pollInterval, REALTIME_SAFETY_POLL_MS, RUN_EVENTS_REALTIME } from "@/lib/builder/run-events-realtime";

const ev = (over: Partial<RunEvent>): RunEvent => ({
  id: "e1", run_id: "r1", step: 1, kind: "tool", tool_id: null, label: "Read the page", status: "ok",
  started_at: "2026-10-31T10:00:00.000Z", finished_at: "2026-10-31T10:00:02.000Z", duration_ms: 2000,
  input_summary: null, output_summary: null, error: null, artifact_url: null, provider: null, model: null, ...over,
});

describe("nodesFromRunEvents", () => {
  it("maps recorded status and duration without inventing any", () => {
    const nodes = nodesFromRunEvents([ev({ id: "a" }), ev({ id: "b", step: 2, status: "running", finished_at: null, duration_ms: null })]);
    expect(nodes.map((n) => n.status)).toEqual(["done", "running"]);
    expect(nodes[0]?.durationMs).toBe(2000);
    expect(nodes[1]?.durationMs).toBeNull();
    expect(nodes[1]?.startedAtMs).toBe(Date.parse("2026-10-31T10:00:00.000Z"));
  });

  it("offers Retry only on a failed LAST step, not on a failure a later step recovered from", () => {
    const recovered = nodesFromRunEvents([ev({ id: "a", status: "failed", error: "timeout" }), ev({ id: "b", step: 2 })]);
    expect(recovered[0]?.status).toBe("failed");
    expect(recovered[0]?.retryable).toBe(false);
    const ended = nodesFromRunEvents([ev({ id: "a" }), ev({ id: "b", step: 2, status: "failed", error: "timeout" })]);
    expect(ended[1]?.retryable).toBe(true);
    expect(ended[1]?.error).toBe("timeout");
  });

  it("shows a declined step as failed but never retryable", () => {
    const [n] = nodesFromRunEvents([ev({ status: "rejected" })]);
    expect(n?.status).toBe("failed");
    expect(n?.retryable).toBe(false);
    expect(n?.error).toBe("Declined");
  });
});

describe("nodesFromProgress / summary", () => {
  const rows = [
    { stage: "writing the plan", detail: null, at: "2026-10-31T10:00:09.000Z" },
    { stage: "reading your site", detail: "3 pages", at: "2026-10-31T10:00:00.000Z" },
  ];
  it("times finished steps by the gap to the next one and keeps the newest running", () => {
    const nodes = nodesFromProgress(rows, { running: true, model: "Some Model" });
    expect(nodes).toHaveLength(2);
    const [first, second] = nodes;
    expect(first?.label).toBe("reading your site");
    expect(first?.status).toBe("done");
    expect(first?.durationMs).toBe(9000);
    expect(second?.status).toBe("running");
    expect(second?.model).toBe("Some Model");
    expect(treeHeadline(nodes)).toBe("writing the plan");
    expect(treeAnnouncement(nodes)).toBe("Now: writing the plan");
  });
  it("has no total when a finished step has no recorded duration, and no fake percentages", () => {
    const nodes: TaskNode[] = [
      { id: "1", label: "a", detail: null, status: "done", durationMs: 1000, startedAtMs: null, model: null, error: null, retryable: false },
      { id: "2", label: "b", detail: null, status: "done", durationMs: null, startedAtMs: null, model: null, error: null, retryable: false },
    ];
    expect(summarizeTree(nodes).totalMs).toBeNull();
    expect(treeHeadline(nodes)).toBe("Done · 2 steps");
    expect(JSON.stringify(summarizeTree(nodes))).not.toContain("percent");
  });
  it("says where it stopped", () => {
    const nodes = nodesFromRunEvents([ev({ status: "failed", error: "x" })]);
    expect(treeHeadline(nodes)).toBe("Stopped at: Read the page");
    expect(treeAnnouncement(nodes)).toBe("Failed: Read the page");
  });
});

describe("realtime plug-in point", () => {
  it("ships polling-only until PAI-2's table is wired, and slows polling only while connected", () => {
    expect(RUN_EVENTS_REALTIME).toBeNull();
    expect(pollInterval(2500, false)).toBe(2500);
    expect(pollInterval(2500, true)).toBe(REALTIME_SAFETY_POLL_MS);
  });
});
