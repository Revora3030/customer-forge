import { describe, expect, it } from "vitest";
import { attemptTimeoutFor, LONG_ANSWER_ATTEMPT_MAX_MS } from "@/lib/ai/router.server";
import { thinkerAttemptTimeoutMs } from "@/lib/ai/thinker.server";

describe("long answers get enough time", () => {
  it("a full 8k-token page plan gets about 4 minutes, not 90 seconds", () => {
    expect(thinkerAttemptTimeoutMs(8000)).toBe(230_000);
  });

  it("short answers keep the 90-second limit", () => {
    expect(thinkerAttemptTimeoutMs(900)).toBe(90_000);
  });

  it("no answer may wait longer than the hard ceiling", () => {
    expect(thinkerAttemptTimeoutMs(50_000)).toBe(240_000);
    expect(attemptTimeoutFor(90_000, 999_999)).toBe(LONG_ANSWER_ATTEMPT_MAX_MS);
  });

  it("a long-answer lane can only raise the limit, never lower it", () => {
    expect(attemptTimeoutFor(90_000, 30_000)).toBe(90_000);
    expect(attemptTimeoutFor(90_000)).toBe(90_000);
    expect(attemptTimeoutFor(90_000, 230_000)).toBe(230_000);
  });
});
