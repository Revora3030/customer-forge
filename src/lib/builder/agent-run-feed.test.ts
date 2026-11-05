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

describe("JC-42 used-note chips", () => {
  const recalled = (data: unknown) => ({ id: 9, kind: "memory_recalled", message: "Used 2 saved notes", created_at: "t", data });

  it("lists the notes the run recorded, with whether each was confirmed", () => {
    const feed = buildRunFeed(run("done"), [
      recalled({
        notes: [
          { id: "a", key: "Opening hours", status: "confirmed", source: "You told us this" },
          { id: "b", key: "Service area", status: "proposed", source: "Found on your site" },
        ],
      }),
    ]);
    expect(feed?.memory).toEqual([
      { id: "a", key: "Opening hours", confirmed: true, source: "You told us this" },
      { id: "b", key: "Service area", confirmed: false, source: "Found on your site" },
    ]);
  });

  it("shows nothing when no note was recalled, or the record is malformed", () => {
    expect(buildRunFeed(run("done"), [])?.memory).toEqual([]);
    expect(buildRunFeed(run("done"), [recalled(null)])?.memory).toEqual([]);
    expect(buildRunFeed(run("done"), [recalled({ notes: "x" })])?.memory).toEqual([]);
    expect(buildRunFeed(run("done"), [recalled({ notes: [null, 3, { key: "no id" }, { id: "x" }] })])?.memory).toEqual([]);
  });

  it("ignores other event kinds that carry a notes field, and repeats of one note", () => {
    const feed = buildRunFeed(run("done"), [
      { id: 1, kind: "tool_finished", message: "m", created_at: "t", data: { notes: [{ id: "z", key: "Fake", status: "confirmed" }] } },
      recalled({ notes: [{ id: "a", key: "Hours", status: "confirmed" }, { id: "a", key: "Hours", status: "confirmed" }] }),
    ]);
    expect(feed?.memory.map((n) => n.id)).toEqual(["a"]);
  });

  it("caps the chips at eight", () => {
    const notes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, key: `K${i}`, status: "confirmed" }));
    expect(buildRunFeed(run("done"), [recalled({ notes })])?.memory).toHaveLength(8);
  });
});
