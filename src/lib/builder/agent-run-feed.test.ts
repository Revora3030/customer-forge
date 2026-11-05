import { describe, expect, it } from "vitest";
import { buildRunFeed, isRunLive, runFeedState } from "./agent-run-feed";

const run = (status: string, extra = {}) => ({
  id: "r",
  status,
  result_summary: null,
  error_plain: null,
  created_at: "2026-11-05T00:00:00Z",
  ...extra,
});

describe("agent run feed", () => {
  it("maps run status to a feed state", () => {
    expect(runFeedState("queued")).toBe("queued");
    expect(runFeedState("processing")).toBe("running");
    expect(runFeedState("needs_approval")).toBe("waiting");
    expect(runFeedState("done")).toBe("done");
    expect(runFeedState("failed")).toBe("failed");
    expect(runFeedState("cancelled")).toBe("cancelled");
    expect(isRunLive("processing")).toBe(true);
    expect(isRunLive("done")).toBe(false);
  });

  it("shows recorded events in order and only the recorded summary", () => {
    const feed = buildRunFeed(run("done", { result_summary: "Asked 3 customers for reviews." }), [
      { id: 1, kind: "run_started", message: "Started working on the goal.", created_at: "t1" },
      { id: 2, kind: "tool_failed", message: "x failed", created_at: "t2" },
      { id: 3, kind: "tool_finished", message: "y finished.", created_at: "t3" },
    ]);
    expect(feed?.headline).toBe("Finished");
    expect(feed?.detail).toBe("Asked 3 customers for reviews.");
    expect(feed?.lines.map((l) => l.tone)).toEqual(["info", "warn", "ok"]);
  });

  it("says a run is waiting for approval and shows the plain failure reason", () => {
    expect(buildRunFeed(run("needs_approval"), [])?.headline).toBe("Waiting for your approval");
    expect(
      buildRunFeed(run("failed", { error_plain: "Stopped. Nothing was sent." }), [])?.detail,
    ).toBe("Stopped. Nothing was sent.");
    expect(buildRunFeed(null, [])).toBeNull();
  });
});
