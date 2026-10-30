import { describe, expect, it } from "vitest";
import { buildJobRunning, isDeferredBuildReply, settleDeferredReplies, settleDeferredTurns, SETTLED_BUILD_REPLY, STALE_QUEUED_MS } from "./build-status-reply";

const deferred = "Got it — your AI team is finishing the first website now. Your request is saved.";
const now = Date.parse("2026-10-29T12:00:00Z");

describe("the first-build reply only claims a build while one runs", () => {
  it("recognises the saved deferral line", () => {
    expect(isDeferredBuildReply(deferred)).toBe(true);
    expect(isDeferredBuildReply("Done — headline updated.")).toBe(false);
    expect(isDeferredBuildReply(null)).toBe(false);
  });
  it("treats a long-untouched queued job as a leftover, not a running build", () => {
    const fresh = { status: "queued", lease_expires_at: null, updated_at: new Date(now - 60_000).toISOString() };
    const stale = { ...fresh, updated_at: new Date(now - STALE_QUEUED_MS - 60_000).toISOString() };
    expect(buildJobRunning([fresh], now)).toBe(true);
    expect(buildJobRunning([stale], now)).toBe(false);
    expect(buildJobRunning([], now)).toBe(false);
  });
  it("rewrites restored deferral replies only when no build runs", () => {
    const tasks = [{ reply: deferred, restored: true }, { reply: deferred, restored: false }, { reply: "Other", restored: true }];
    expect(settleDeferredReplies(tasks, true)).toEqual(tasks);
    expect(settleDeferredReplies(tasks, false).map((t) => t.reply)).toEqual([SETTLED_BUILD_REPLY, deferred, "Other"]);
    expect(settleDeferredTurns([{ role: "assistant", content: deferred }, { role: "user", content: deferred }], false).map((t) => t.content)).toEqual([SETTLED_BUILD_REPLY, deferred]);
  });
});
