import { describe, expect, it } from "vitest";
import { capacityDelayMs, capacityVerdict, MAX_CAPACITY_DEFERRALS } from "./site-engine.worker.server";

const fail = (error_category: string) => ({ ok: false, error_category });
const ok = { ok: true, error_category: null };

describe("free AI pool capacity deferral", () => {
  it("waits out a rate-limited pool instead of burning an attempt", () => {
    const calls = [...Array(9).fill(fail("rate_limited")), fail("quota"), fail("timeout"), ok, ok, ok];
    const verdict = capacityVerdict(calls, 0, Date.parse("2026-10-19T10:00:00Z"));
    expect(verdict?.count).toBe(1);
    expect(verdict?.retryAt.toISOString()).toBe("2026-10-19T10:15:00.000Z");
    expect(verdict?.summary).toBe("11 of 14 AI calls were rate-limited or timed out");
  });

  it("treats a few failures, or other errors, as an ordinary build failure", () => {
    expect(capacityVerdict([fail("rate_limited"), fail("timeout"), ok], 0)).toBeNull();
    expect(capacityVerdict([...Array(6).fill(fail("bad_response")), ok], 0)).toBeNull();
    expect(capacityVerdict([...Array(5).fill(fail("rate_limited")), ...Array(10).fill(ok)], 0)).toBeNull();
    expect(capacityVerdict([], 0)).toBeNull();
  });

  it("backs off 15 min to 3 h and stops after the maximum waits", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => capacityDelayMs(n) / 60_000)).toEqual([15, 30, 60, 120, 180, 180]);
    expect(capacityVerdict(Array(8).fill(fail("rate_limited")), MAX_CAPACITY_DEFERRALS)).toBeNull();
  });
});
