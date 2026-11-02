import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LoadTimeoutError,
  NoProgressError,
  STALL_MESSAGE_BUSY,
  STALL_MESSAGE_GENERIC,
  aiPressureSeen,
  carryOverCheckpoints,
  clientStallVerdict,
  createProgressWatch,
  isStallMessage,
  noteProgress,
  registerProgressWatch,
  runWithNoProgressGuard,
  withTimeout,
} from "./no-progress";
import { describeBuildFailure, tagFailureMessage } from "./build-failure";

afterEach(() => vi.useRealTimers());

describe("progress watch", () => {
  it("is stalled only after the limit and resets on touch", () => {
    const watch = createProgressWatch(1000, 0);
    expect(watch.stalled(500)).toBe(false);
    expect(watch.stalled(1000 + Date.now())).toBe(true);
    watch.touch("layout");
    expect(watch.stage()).toBe("layout");
    expect(watch.stalled()).toBe(false);
  });
  it("saves elsewhere mark progress through the registry", () => {
    const watch = createProgressWatch(10, 0);
    registerProgressWatch("job-1", watch);
    noteProgress("job-1", "layout");
    expect(watch.stage()).toBe("layout");
    registerProgressWatch("job-1", null);
    expect(() => noteProgress("job-1")).not.toThrow();
  });
});

describe("runWithNoProgressGuard", () => {
  it("fails a hung step with a busy message when the AI was rate limited", async () => {
    vi.useFakeTimers();
    const watch = createProgressWatch(1000);
    watch.touch("layout");
    const onStall = vi.fn(async () => true);
    const result = runWithNoProgressGuard(() => new Promise<never>(() => undefined), watch, { checkEveryMs: 100, onStall });
    const assertion = expect(result).rejects.toMatchObject({ name: "NoProgressError", busy: true, stage: "layout", message: STALL_MESSAGE_BUSY });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(onStall).toHaveBeenCalledTimes(1);
  });
  it("uses the generic wording when the cause is unknown", async () => {
    vi.useFakeTimers();
    const watch = createProgressWatch(1000);
    const result = runWithNoProgressGuard(() => new Promise<never>(() => undefined), watch, { checkEveryMs: 100 });
    const assertion = expect(result).rejects.toMatchObject({ busy: false, message: STALL_MESSAGE_GENERIC });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });
  it("does not fire while progress keeps arriving, and returns the result", async () => {
    vi.useFakeTimers();
    const watch = createProgressWatch(1000);
    const result = runWithNoProgressGuard(
      async () => {
        for (let i = 0; i < 5; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          watch.touch("layout");
        }
        return "done";
      },
      watch,
      { checkEveryMs: 100 },
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect(result).resolves.toBe("done");
  });
  it("passes through the work's own error", async () => {
    await expect(runWithNoProgressGuard(async () => { throw new Error("boom"); }, createProgressWatch(60_000))).rejects.toThrow("boom");
  });
});

describe("stall wording and carry-over", () => {
  it("detects stall messages with or without the kind tag", () => {
    expect(isStallMessage(STALL_MESSAGE_BUSY)).toBe(true);
    expect(isStallMessage(tagFailureMessage("provider", STALL_MESSAGE_BUSY))).toBe(true);
    expect(isStallMessage("Something else")).toBe(false);
  });
  it("shows the owner the busy message for a stalled build and allows retry", () => {
    const failure = describeBuildFailure({ status: "failed", failure_kind: "provider", error_message: tagFailureMessage("provider", new NoProgressError("layout", 1, true).message) });
    expect(failure?.message).toBe(STALL_MESSAGE_BUSY);
    expect(failure?.canRetry).toBe(true);
    const generic = describeBuildFailure({ status: "failed", failure_kind: "infrastructure", error_message: tagFailureMessage("infrastructure", STALL_MESSAGE_GENERIC) });
    expect(generic?.message).toBe(STALL_MESSAGE_GENERIC);
  });
  it("detects AI pressure from 402/429/timeout categories only", () => {
    expect(aiPressureSeen([{ ok: false, error_category: "rate_limited" }])).toBe(true);
    expect(aiPressureSeen([{ ok: false, error_category: "quota" }])).toBe(true);
    expect(aiPressureSeen([{ ok: true, error_category: null }, { ok: false, error_category: "invalid" }])).toBe(false);
  });
  it("re-stamps checkpoints for the retry job and keeps their content", () => {
    const stages = { version: 1, jobId: "old", stages: { identity: { digest: "d", value: { a: 1 }, at: "t" } } };
    expect(carryOverCheckpoints(stages, "new")).toEqual({ ...stages, jobId: "new" });
    expect(carryOverCheckpoints(null, "new")).toBeNull();
    expect(carryOverCheckpoints([1], "new")).toBeNull();
  });
});

describe("client verdicts and load timeout", () => {
  it("calls a processing build stalled only after the window", () => {
    const now = Date.parse("2026-10-31T20:00:00Z");
    expect(clientStallVerdict({ status: "processing", updated_at: "2026-10-31T19:50:00Z" }, now)).toBe(true);
    expect(clientStallVerdict({ status: "processing", updated_at: "2026-10-31T19:58:00Z" }, now)).toBe(false);
    expect(clientStallVerdict({ status: "failed", updated_at: "2026-10-31T19:00:00Z" }, now)).toBe(false);
    expect(clientStallVerdict(null, now)).toBe(false);
  });
  it("rejects a load that never settles instead of hanging", async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<never>(() => undefined), 500);
    const assertion = expect(result).rejects.toBeInstanceOf(LoadTimeoutError);
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });
  it("returns a load that settles in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 500)).resolves.toBe(7);
  });
});
