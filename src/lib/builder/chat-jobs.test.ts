import { describe, expect, it } from "vitest";
import { chatJobWorkerPath, REUSE_DONE_FOR_MS, reuseDecision } from "./chat-jobs.server";

describe("builder chat jobs keep running without the browser", () => {
  const now = Date.parse("2026-11-02T23:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();

  it("a request still running is waited on, never started twice", () => {
    expect(reuseDecision({ status: "running", created_at: at(60_000) }, now)).toBe("wait");
    expect(reuseDecision({ status: "queued", created_at: at(1_000) }, now)).toBe("wait");
  });

  it("a finished request under the same key is reused within 15 minutes", () => {
    expect(REUSE_DONE_FOR_MS).toBe(15 * 60 * 1000);
    expect(reuseDecision({ status: "done", created_at: at(14 * 60 * 1000) }, now)).toBe("reuse");
    expect(reuseDecision({ status: "done", created_at: at(16 * 60 * 1000) }, now)).toBe("requeue");
  });

  it("a failed or stopped request is run again on retry", () => {
    expect(reuseDecision({ status: "failed", created_at: at(1_000) }, now)).toBe("requeue");
    expect(reuseDecision({ status: "cancelled", created_at: at(1_000) }, now)).toBe("requeue");
  });

  it("the worker path only accepts a job id", () => {
    expect(chatJobWorkerPath("E0C08AA2-A95F-4049-8CE0-FFBB869DAE10")).toBe("builder-chat?job=e0c08aa2-a95f-4049-8ce0-ffbb869dae10");
    expect(() => chatJobWorkerPath("../site-engine")).toThrow();
  });
});
