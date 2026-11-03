import { describe, expect, it } from "vitest";
import { buildTimelines, summariseRequests } from "./request-health";

const msg = (request_id: string, role: string, created_at: string, extra: Record<string, unknown> = {}) => ({
  request_id,
  role,
  kind: "text",
  content: "x",
  plan: null,
  created_at,
  ...extra,
});

describe("builder request health", () => {
  it("joins progress steps written with ~ to the chat request using _", () => {
    const t = buildTimelines(
      [msg("a_1", "user", "2026-11-03T00:00:00Z"), msg("a_1", "assistant", "2026-11-03T00:01:00Z")],
      [
        { run_id: "a~1", stage: "planning the change", created_at: "2026-11-03T00:00:10Z" },
        { run_id: "a~1", stage: "reviewing for safety", created_at: "2026-11-03T00:00:40Z" },
      ],
    );
    expect(t[0]!.totalSeconds).toBe(60);
    expect(t[0]!.stages).toEqual([
      { stage: "planning the change", seconds: 30 },
      { stage: "reviewing for safety", seconds: 20 },
    ]);
  });

  it("counts an error reply as failed with its first line as the reason", () => {
    const t = buildTimelines(
      [
        msg("b", "user", "2026-11-03T00:00:00Z"),
        msg("b", "assistant", "2026-11-03T00:00:05Z", { kind: "error", content: "Load failed\nmore" }),
      ],
      [],
    );
    expect(t[0]!.outcome).toBe("failed");
    expect(t[0]!.reason).toBe("Load failed");
  });

  it("success rate counts changes and answers out of all requests", () => {
    const t = buildTimelines(
      [
        msg("c", "user", "2026-11-03T00:00:00Z"),
        msg("c", "assistant", "2026-11-03T00:00:05Z", { plan: {} }),
        msg("d", "user", "2026-11-03T00:00:00Z"),
        msg("d", "assistant", "2026-11-03T00:00:05Z"),
        msg("e", "user", "2026-11-03T00:00:00Z"),
        msg("e", "assistant", "2026-11-03T00:00:05Z", { kind: "error", content: "Load failed" }),
        msg("f", "user", "2026-11-03T00:00:00Z"),
      ],
      [],
    );
    const s = summariseRequests(t);
    expect([s.changed, s.answered, s.failed, s.noReply]).toEqual([1, 1, 1, 1]);
    expect(s.successRate).toBe(50);
    expect(s.topReasons).toEqual([{ reason: "Load failed", count: 1 }]);
  });
});
