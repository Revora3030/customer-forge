import { describe, expect, it } from "vitest";
import { isAbortLike } from "./monitoring.server";

describe("isAbortLike", () => {
  it("treats visitor disconnects as aborts", () => {
    expect(isAbortLike(new Error("aborted"))).toBe(true);
    expect(isAbortLike(new Error("This operation was aborted"))).toBe(true);
    expect(isAbortLike(new Error("HTTP 499"))).toBe(true);
  });
  it("keeps real failures as errors", () => {
    expect(isAbortLike(new Error("Database timeout"))).toBe(false);
  });
});
